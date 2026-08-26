import { access } from "node:fs/promises";
import chromiumBinary from "@sparticuz/chromium";
import { chromium as playwrightChromium } from "playwright-core";

const DEFAULT_LOCAL_CHROME_PATHS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
];

async function canExecute(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function resolveLocalChromePath() {
  const configuredPath = process.env.INVOICE_CHROME_EXECUTABLE_PATH?.trim();
  if (configuredPath) {
    if (!(await canExecute(configuredPath))) {
      throw new Error("INVOICE_CHROME_EXECUTABLE_PATH does not point to an accessible browser executable.");
    }
    return configuredPath;
  }

  for (const path of DEFAULT_LOCAL_CHROME_PATHS) {
    if (await canExecute(path)) return path;
  }

  throw new Error(
    "No local Chrome executable was found. Set INVOICE_CHROME_EXECUTABLE_PATH for local invoice PDF generation.",
  );
}

function isServerlessRuntime() {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.AWS_EXECUTION_ENV);
}

export async function renderHtmlToPdf(html: string): Promise<Buffer> {
  const serverless = isServerlessRuntime();
  chromiumBinary.setGraphicsMode = false;

  const browser = await playwrightChromium.launch({
    args: serverless ? chromiumBinary.args : [],
    executablePath: serverless ? await chromiumBinary.executablePath() : await resolveLocalChromePath(),
    headless: true,
  });

  try {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    });
    await page.setContent(html, { waitUntil: "load" });
    await page.emulateMedia({ media: "print" });
    const pdf = await page.pdf({
      format: "Letter",
      printBackground: true,
      preferCSSPageSize: true,
      tagged: true,
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
