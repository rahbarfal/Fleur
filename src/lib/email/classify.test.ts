import assert from "node:assert/strict";
import { test } from "node:test";
import { classify, looksHuman, ownDomainOf, type ClassifyContext, type ClassifyInput } from "./classify";

const ctx: ClassifyContext = { rules: [], ownDomain: null };
const mail = (from: string, subject: string, opts: Partial<ClassifyInput> = {}): ClassifyInput => ({
  fromAddress: from,
  fromName: from.split("@")[0],
  subject,
  snippet: "",
  labels: [],
  bulk: false,
  ...opts,
});
const cat = (e: ClassifyInput, c = ctx) => classify(e, c).category;
const stage = (e: ClassifyInput, c = ctx) => classify(e, c).jobStage;

test("job search: stages in English and Indonesian", () => {
  const cases: [ClassifyInput, string | null][] = [
    [mail("no-reply@greenhouse.io", "Thank you for applying to Tokopedia"), "applied"],
    [mail("jobs-noreply@linkedin.com", "Your application was sent to Gojek"), "applied"],
    [mail("hr@company.co.id", "Undangan Wawancara - Backend Engineer"), "interview"],
    [mail("talent@startup.com", "Interview invitation: Product Designer", { labels: ["CATEGORY_UPDATES"] }), "interview"],
    [mail("noreply@hackerrank.com", "Your coding challenge for Traveloka"), "assessment"],
    [mail("rekrutmen@bumn.co.id", "Undangan Psikotes Online"), "assessment"],
    [mail("careers@acme.com", "Offer Letter - Software Engineer"), "offer"],
    [mail("no-reply@ashbyhq.com", "Update on your application", { snippet: "Unfortunately we will not be moving forward" }), "rejected"],
    [mail("hr@pt-abc.co.id", "Hasil Seleksi", { snippet: "Mohon maaf, Anda belum dapat melanjutkan ke tahap berikutnya" }), "rejected"],
    [mail("jobalerts-noreply@linkedin.com", "30+ new jobs for Frontend Developer", { labels: ["CATEGORY_PROMOTIONS"], bulk: true }), "alert"],
    [mail("noreply@glints.com", "Lowongan baru untuk kamu", { labels: ["CATEGORY_PROMOTIONS"], bulk: true }), "alert"],
    [mail("noreply@jobstreet.co.id", "Tips menulis CV", { labels: ["CATEGORY_PROMOTIONS"], bulk: true }), null],
  ];
  for (const [e, s] of cases) {
    assert.equal(cat(e), "jobseek", e.subject);
    assert.equal(stage(e), s, e.subject);
  }
});

test("job words inside an advert don't make it job search", () => {
  assert.equal(cat(mail("promo@shop.com", "Flash sale", { snippet: "Interview tips inside!", labels: ["CATEGORY_PROMOTIONS"], bulk: true })), "social");
});

test("finance: bank and payment mail, but bank promos are Social", () => {
  assert.equal(cat(mail("bca@bca.co.id", "Notifikasi Transaksi")), "finance");
  assert.equal(cat(mail("noreply.livin@bankmandiri.co.id", "Transfer Berhasil")), "finance");
  assert.equal(cat(mail("no-reply@gojek.com", "Pembayaran berhasil")), "finance");
  assert.equal(cat(mail("cs@ajaib.co.id", "Pembagian Dividen BBCA")), "finance");
  assert.equal(cat(mail("info@netflix.com", "Your receipt from Netflix", { labels: ["CATEGORY_UPDATES"] })), "finance");
  assert.equal(cat(mail("promo@bca.co.id", "Cashback 50% di Tokopedia", { labels: ["CATEGORY_PROMOTIONS"], bulk: true })), "social");
});

test("work: tools and your company domain", () => {
  assert.equal(cat(mail("notifications@github.com", "[fleur] CI passed", { labels: ["CATEGORY_UPDATES"] })), "work");
  assert.equal(cat(mail("feedback@slack.com", "New message in #general")), "work");
  assert.equal(cat(mail("budi@acme.co.id", "Sprint planning"), { rules: [], ownDomain: "acme.co.id" }), "work");
});

test("Gmail tabs and people", () => {
  assert.equal(cat(mail("info@tokopedia.com", "Flash Sale 11.11", { labels: ["CATEGORY_PROMOTIONS"], bulk: true })), "social");
  assert.equal(cat(mail("messages-noreply@linkedin.com", "You appeared in 12 searches", { labels: ["CATEGORY_SOCIAL"], bulk: true })), "social");
  assert.equal(cat(mail("no-reply@accounts.google.com", "Security alert", { labels: ["CATEGORY_UPDATES"] })), "updates");
  assert.equal(cat(mail("dimas@gmail.com", "Futsal Kamis?", { labels: ["CATEGORY_PERSONAL"] })), "personal");
  assert.equal(cat(mail("sarah.w@company.com", "Re: Rencana liburan", { labels: ["CATEGORY_PERSONAL"] })), "personal");
  assert.equal(cat(mail("newsletter@medium.com", "Daily digest", { labels: ["CATEGORY_PERSONAL"], bulk: true })), "updates");
  assert.equal(cat(mail("no-reply@service.com", "Your code is 123456")), "updates");
});

test("rules win, most specific first", () => {
  const rules: ClassifyContext = {
    ownDomain: null,
    rules: [
      { kind: "domain", pattern: "acme.com", category: "work" },
      { kind: "domain", pattern: "news.acme.com", category: "social" },
      { kind: "address", pattern: "boss@acme.com", category: "personal" },
      { kind: "domain", pattern: "bca.co.id", category: "updates" },
    ],
  };
  assert.deepEqual(classify(mail("x@acme.com", "Hi"), rules), { category: "work", source: "rule", jobStage: null });
  assert.equal(cat(mail("x@news.acme.com", "Hi"), rules), "social");
  assert.equal(cat(mail("Boss@Acme.com", "Hi"), rules), "personal");
  assert.equal(cat(mail("bca@bca.co.id", "Notifikasi Transaksi"), rules), "updates");
});

test("helpers", () => {
  assert.equal(looksHuman({ fromAddress: "dimas@gmail.com", bulk: false }), true);
  assert.equal(looksHuman({ fromAddress: "noreply@gmail.com", bulk: false }), false);
  assert.equal(looksHuman({ fromAddress: "dimas@gmail.com", bulk: true }), false);
  assert.equal(looksHuman({ fromAddress: "notifications@app.io", bulk: false }), false);
  assert.equal(looksHuman({ fromAddress: "andi.pratama@firm.co.id", bulk: false }), true);
  assert.equal(ownDomainOf("me@gmail.com"), null);
  assert.equal(ownDomainOf("me@acme.co.id"), "acme.co.id");
});
