/**
 * audit-classroom.ts — Auditoría completa del Classroom con Playwright
 *
 * Flujo: Login → Dashboard → Módulo → Lección → Admin Lessons → Admin Progress → Admin Resources
 *
 * Uso: npx playwright test scripts/audit-classroom.ts --headed
 *   o: npx tsx scripts/audit-classroom.ts
 */

import { chromium } from "playwright";

const BASE = "http://localhost:3001";
const EMAIL = "admin@capitalacademy.cl";
const PASS = "CapitalAdmin2026!";

type AuditResult = {
  name: string;
  status: "PASS" | "FAIL" | "WARN";
  detail: string;
  screenshot?: string;
};

const results: AuditResult[] = [];

function log(r: AuditResult) {
  const icon = r.status === "PASS" ? "✅" : r.status === "FAIL" ? "❌" : "⚠️";
  console.log(`${icon} ${r.name}: ${r.detail}`);
  results.push(r);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  console.log("\n🔍 AUDITORÍA CLASSROOM — Capital Academy\n");
  console.log("=".repeat(60) + "\n");

  // ── 1. Login page loads ──
  try {
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    const title = await page.textContent("h1");
    const hasForm = await page.locator('input[type="email"]').isVisible();
    log({
      name: "Login — Página carga",
      status: hasForm ? "PASS" : "FAIL",
      detail: title ? `Título: "${title}", formulario visible: ${hasForm}` : "Sin título",
    });
    await page.screenshot({ path: "/tmp/audit-01-login.png" });
  } catch (e) {
    log({ name: "Login — Página carga", status: "FAIL", detail: String(e) });
  }

  // ── 2. Login works ──
  try {
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASS);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/classroom/**", { timeout: 10000 });
    const url = page.url();
    log({
      name: "Login — Autenticación",
      status: url.includes("/classroom") ? "PASS" : "FAIL",
      detail: `Redirigido a: ${url}`,
    });
  } catch (e) {
    log({ name: "Login — Autenticación", status: "FAIL", detail: String(e) });
    await page.screenshot({ path: "/tmp/audit-02-login-error.png" });
  }

  // ── 3. Dashboard loads ──
  try {
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "/tmp/audit-03-dashboard.png" });
    const heroText = await page.textContent("h1");
    const hasSidebar = await page.locator('aside').first().isVisible().catch(() => false);
    log({
      name: "Dashboard — Carga",
      status: heroText ? "PASS" : "FAIL",
      detail: `Hero: "${heroText?.slice(0, 50)}", Sidebar: ${hasSidebar}`,
    });
  } catch (e) {
    log({ name: "Dashboard — Carga", status: "FAIL", detail: String(e) });
  }

  // ── 4. Module cards visible ──
  try {
    const cards = await page.locator("article, [class*='ca-card']").count();
    log({
      name: "Dashboard — Cards de módulos",
      status: cards > 0 ? "PASS" : "WARN",
      detail: `${cards} cards encontradas`,
    });
  } catch (e) {
    log({ name: "Dashboard — Cards de módulos", status: "FAIL", detail: String(e) });
  }

  // ── 5. Navigate to module ──
  try {
    const firstModuleLink = page.locator('a[href*="/classroom/"]').first();
    if (await firstModuleLink.isVisible()) {
      await firstModuleLink.click();
      await page.waitForLoadState("networkidle");
      await page.screenshot({ path: "/tmp/audit-04-module.png" });
      const title = await page.textContent("h1");
      log({
        name: "Módulo — Navegación",
        status: title ? "PASS" : "WARN",
        detail: `Título módulo: "${title?.slice(0, 50)}"`,
      });
    } else {
      log({ name: "Módulo — Navegación", status: "WARN", detail: "No hay links de módulo visibles" });
    }
  } catch (e) {
    log({ name: "Módulo — Navegación", status: "FAIL", detail: String(e) });
  }

  // ── 6. Navigate to lesson ──
  try {
    const lessonLink = page.locator('a[href*="/classroom/"][href*="/"]').first();
    if (await lessonLink.isVisible()) {
      await lessonLink.click();
      await page.waitForLoadState("networkidle");
      await page.screenshot({ path: "/tmp/audit-05-lesson.png" });
      const hasVideoPlaceholder = await page.locator(".video-stage, [class*='video']").first().isVisible().catch(() => false);
      const title = await page.textContent("h1");
      log({
        name: "Lección — Carga",
        status: title ? "PASS" : "WARN",
        detail: `Título: "${title?.slice(0, 50)}", Video area: ${hasVideoPlaceholder}`,
      });
    } else {
      log({ name: "Lección — Navegación", status: "WARN", detail: "No hay links de lección" });
    }
  } catch (e) {
    log({ name: "Lección — Navegación", status: "FAIL", detail: String(e) });
  }

  // ── 7. Admin Lessons page ──
  try {
    await page.goto(`${BASE}/admin/lessons`, { waitUntil: "networkidle" });
    await page.screenshot({ path: "/tmp/audit-06-admin-lessons.png" });
    const title = await page.textContent("h1");
    log({
      name: "Admin Lessons — Carga",
      status: title ? "PASS" : "FAIL",
      detail: `Título: "${title?.slice(0, 50)}"`,
    });
  } catch (e) {
    log({ name: "Admin Lessons — Carga", status: "FAIL", detail: String(e) });
  }

  // ── 8. Admin Progress page ──
  try {
    await page.goto(`${BASE}/admin/progress`, { waitUntil: "networkidle" });
    await page.screenshot({ path: "/tmp/audit-07-admin-progress.png" });
    const title = await page.textContent("h1");
    log({
      name: "Admin Progress — Carga",
      status: title ? "PASS" : "FAIL",
      detail: `Título: "${title?.slice(0, 50)}"`,
    });
  } catch (e) {
    log({ name: "Admin Progress — Carga", status: "FAIL", detail: String(e) });
  }

  // ── 9. Admin Resources page ──
  try {
    await page.goto(`${BASE}/admin/resources`, { waitUntil: "networkidle" });
    await page.screenshot({ path: "/tmp/audit-08-admin-resources.png" });
    const title = await page.textContent("h1");
    log({
      name: "Admin Resources — Carga",
      status: title ? "PASS" : "FAIL",
      detail: `Título: "${title?.slice(0, 50)}"`,
    });
  } catch (e) {
    log({ name: "Admin Resources — Carga", status: "FAIL", detail: String(e) });
  }

  // ── 10. Mobile viewport ──
  try {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${BASE}/classroom`, { waitUntil: "networkidle" });
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "/tmp/audit-09-mobile.png" });
    const hamburger = await page.locator('button[aria-label="Abrir menú"]').isVisible().catch(() => false);
    log({
      name: "Mobile — Header con hamburger",
      status: hamburger ? "PASS" : "WARN",
      detail: `Hamburger visible: ${hamburger}`,
    });
  } catch (e) {
    log({ name: "Mobile — Layout", status: "FAIL", detail: String(e) });
  }

  // ── 11. 404 page ──
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${BASE}/classroom/nonexistent`, { waitUntil: "networkidle" });
    await page.screenshot({ path: "/tmp/audit-10-404.png" });
    const has404 = await page.textContent("body");
    log({
      name: "404 — Página no encontrada",
      status: has404?.includes("404") || has404?.includes("no encontr") ? "PASS" : "WARN",
      detail: `Contenido: "${has404?.slice(0, 80)}"`,
    });
  } catch (e) {
    log({ name: "404 — Página", status: "FAIL", detail: String(e) });
  }

  await browser.close();

  // ── RESUMEN ──
  console.log("\n" + "=".repeat(60));
  console.log("📋 RESUMEN DE AUDITORÍA");
  console.log("=".repeat(60) + "\n");

  const pass = results.filter((r) => r.status === "PASS").length;
  const fail = results.filter((r) => r.status === "FAIL").length;
  const warn = results.filter((r) => r.status === "WARN").length;

  console.log(`✅ PASS: ${pass}   ❌ FAIL: ${fail}   ⚠️ WARN: ${warn}   Total: ${results.length}\n`);

  if (fail > 0) {
    console.log("Fallos:");
    results.filter((r) => r.status === "FAIL").forEach((r) => console.log(`  ❌ ${r.name}: ${r.detail}`));
  }
  if (warn > 0) {
    console.log("\nAdvertencias:");
    results.filter((r) => r.status === "WARN").forEach((r) => console.log(`  ⚠️ ${r.name}: ${r.detail}`));
  }

  console.log("\n📸 Screenshots guardados en /tmp/audit-*.png");
}

main().catch(console.error);
