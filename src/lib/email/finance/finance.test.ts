import assert from "node:assert/strict";
import { test } from "node:test";
import { amountsIn, financeSourceOf, htmlToText, mainAmount, parseNumber } from "./common";
import { parseFinanceEmail } from "./index";

const at = new Date("2026-11-16T03:00:00Z");
const email = (fromAddress: string, subject: string, text: string) => ({ fromAddress, subject, text, receivedAt: at });

test("rupiah formats", () => {
  assert.equal(parseNumber("1.234.567,00"), 1234567);
  assert.equal(parseNumber("1,234,567.00"), 1234567);
  assert.equal(parseNumber("125.000"), 125000);
  assert.equal(parseNumber("125000"), 125000);
  assert.equal(parseNumber("1.500"), 1500);
  assert.equal(parseNumber("50.000,-"), 50000);
  assert.deepEqual(amountsIn("Rp 50.000 lalu IDR 1,250,000.00 dan Rp125.000"), [50000, 1250000, 125000]);
  assert.deepEqual(mainAmount("Biaya admin Rp 2.500\nNominal : Rp 100.000,00"), { amount: 100000, sure: true });
  assert.deepEqual(mainAmount("Rp 10.000 dan Rp 20.000"), { amount: 10000, sure: false });
});

test("sources", () => {
  assert.equal(financeSourceOf("bca@bca.co.id"), "bca");
  assert.equal(financeSourceOf("noreply@klikbca.com"), "bca");
  assert.equal(financeSourceOf("noreply.livin@bankmandiri.co.id"), "mandiri");
  assert.equal(financeSourceOf("no-reply@gojek.com"), "gopay");
  assert.equal(financeSourceOf("cs@mail.ajaib.co.id"), "ajaib");
  assert.equal(financeSourceOf("info@tokopedia.com"), null);
});

test("html to text keeps table rows", () => {
  const t = htmlToText("<table><tr><td>Nominal</td><td>Rp 50.000</td></tr><tr><td>Penerima</td><td>Budi&nbsp;S</td></tr></table>");
  assert.match(t, /Nominal : Rp 50\.000/);
  assert.match(t, /Penerima : Budi S/);
});

test("BCA", () => {
  const qris = parseFinanceEmail("bca", email("bca@bca.co.id", "Notifikasi Transaksi", "Pembayaran QRIS\nNama Merchant : KOPI KENANGAN\nNominal : IDR 32,000.00"));
  assert.equal(qris?.kind, "expense");
  assert.equal(qris?.amount, 32000);
  assert.equal(qris?.title, "KOPI KENANGAN");
  assert.equal(qris?.confident, true);

  const tf = parseFinanceEmail("bca", email("bca@bca.co.id", "Internet Transaction Journal", "Transfer to BCA Account\nBeneficiary Name : BUDI SANTOSO\nAmount : IDR 1,500,000.00"));
  assert.equal(tf?.kind, "transfer_out");
  assert.equal(tf?.counterparty, "BUDI SANTOSO");

  const va = parseFinanceEmail("bca", email("bca@bca.co.id", "Notifikasi Transaksi", "Pembayaran Virtual Account\nPenerima : GOPAY - NAUFAL\nNominal : Rp 200.000,00"));
  assert.equal(va?.kind, "transfer_out");
  assert.equal(va?.amount, 200000);

  const inc = parseFinanceEmail("bca", email("bca@bca.co.id", "Notifikasi Transaksi", "Transfer Masuk\nPengirim : PT MAJU JAYA\nNominal : Rp 8.500.000,00"));
  assert.equal(inc?.kind, "income");
  assert.equal(inc?.title, "Transfer from PT MAJU JAYA");

  assert.equal(parseFinanceEmail("bca", email("bca@bca.co.id", "e-Statement Bulanan", "Rp 1.000")), null);
});

test("Mandiri", () => {
  const tf = parseFinanceEmail("mandiri", email("noreply.livin@bankmandiri.co.id", "Transfer Berhasil", "Penerima : SARI DEWI\nNominal Transaksi : Rp 750.000,00\nBiaya Admin : Rp 0,00"));
  assert.equal(tf?.kind, "transfer_out");
  assert.equal(tf?.amount, 750000);
  const top = parseFinanceEmail("mandiri", email("noreply.livin@bankmandiri.co.id", "Top-up Berhasil", "Penyedia Jasa : GoPay\nNominal Top-up : Rp 100.000,00"));
  assert.equal(top?.kind, "transfer_out");
  assert.equal(top?.amount, 100000);
  const pay = parseFinanceEmail("mandiri", email("noreply.livin@bankmandiri.co.id", "Pembayaran Berhasil", "Biller : PLN Prabayar\nTotal Pembayaran : Rp 202.500,00"));
  assert.equal(pay?.kind, "expense");
  assert.equal(pay?.title, "PLN Prabayar");
});

test("GoPay", () => {
  const food = parseFinanceEmail("gopay", email("no-reply@gojek.com", "Pembayaran berhasil", "GoFood\nNama Merchant : Bakmi GM\nMetode pembayaran : GoPay\nTotal pembayaran Rp48.000"));
  assert.equal(food?.kind, "expense");
  assert.equal(food?.title, "GoFood · Bakmi GM");
  assert.equal(food?.confident, true);

  const cash = parseFinanceEmail("gopay", email("no-reply@gojek.com", "Terima kasih telah menggunakan GoRide", "GoRide\nMetode pembayaran : Tunai\nTotal Rp 18.000"));
  assert.equal(cash?.kind, "expense");
  assert.equal(cash?.confident, false);

  const top = parseFinanceEmail("gopay", email("no-reply@gojek.com", "Top up GoPay berhasil", "Top up saldo GoPay dari BCA\nNominal : Rp 200.000"));
  assert.equal(top?.kind, "topup");
  assert.equal(top?.amount, 200000);
});

test("Ajaib", () => {
  const div = parseFinanceEmail("ajaib", email("cs@ajaib.co.id", "Pembagian Dividen BBCA", "Kode Saham : BBCA\nDividen Bersih : Rp 27.000"));
  assert.equal(div?.kind, "dividend");
  assert.equal(div?.title, "Dividend BBCA");
  assert.equal(div?.amount, 27000);
  assert.equal(div?.confident, true);

  const buy = parseFinanceEmail("ajaib", email("cs@ajaib.co.id", "Order Beli BBRI Terpenuhi", "Order beli kamu sudah terpenuhi\nSaham : BBRI\nJumlah : 5 lot\nHarga : Rp 3.100\nTotal : Rp 1.550.000"));
  assert.equal(buy?.kind, "trade");
  assert.deepEqual(buy?.stock, { symbol: "BBRI", side: "buy", lots: 5, price: 3100 });

  const top = parseFinanceEmail("ajaib", email("cs@ajaib.co.id", "Top Up Berhasil", "Top up RDN kamu berhasil\nNominal : Rp 1.000.000"));
  assert.equal(top?.kind, "topup");

  assert.equal(parseFinanceEmail("ajaib", email("cs@ajaib.co.id", "Market update minggu ini", "IHSG naik")), null);
});
