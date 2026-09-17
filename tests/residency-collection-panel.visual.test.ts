import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import bundledChromium from "@sparticuz/chromium";
import { chromium, type Browser, type Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ResidencyCollectionFilters,
  ResidencyCollectionList,
  ResidencyCollectionPanel,
  ResidencyCollectionRow,
  ResidencyCollectionSearch,
  ResidencyCollectionToolbar,
  ResidencyCollectionUtility,
} from "../src/components/residency-design-system";

const viewports = [
  { width: 1440, height: 900, maxHeight: "680px" },
  { width: 1200, height: 800, maxHeight: "440px" },
  { width: 1024, height: 768, maxHeight: "440px" },
] as const;

const baselineDirectory = new URL("./visual-baselines/", import.meta.url);

async function browserExecutable() {
  const explicitPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  if (explicitPath) return { executablePath: explicitPath, args: [] as string[] };

  const localCandidates = process.platform === "darwin"
    ? [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
      ]
    : ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
  const localPath = localCandidates.find((candidate) => existsSync(candidate));
  if (localPath) return { executablePath: localPath, args: [] as string[] };

  return {
    executablePath: await bundledChromium.executablePath(),
    args: bundledChromium.args,
  };
}

function collectionFixture() {
  const panel = createElement(
    ResidencyCollectionPanel,
    null,
    createElement(
      ResidencyCollectionToolbar,
      null,
      createElement(ResidencyCollectionSearch, {
        id: "visual-collection-search",
        label: "Search artists",
        value: "",
        onChange: () => undefined,
        placeholder: "Search by artist name",
      }),
      createElement(ResidencyCollectionFilters, {
        value: "active",
        ariaLabel: "Artist status",
        items: [
          { id: "active", label: "Active", count: 2 },
          { id: "owed", label: "Owed", count: 2 },
          { id: "archived", label: "Archived", count: 0 },
        ],
        onChange: () => undefined,
      }),
      createElement(ResidencyCollectionUtility, {
        count: 2,
        countLabel: "artists",
        sortLabel: "Sort",
        sortValue: "name_asc",
        sortOptions: [
          { value: "name_asc", label: "Name A–Z" },
          { value: "name_desc", label: "Name Z–A" },
        ],
        onSortChange: () => undefined,
      }),
    ),
    createElement(
      ResidencyCollectionList,
      null,
      createElement(ResidencyCollectionRow, {
        title: "DANAISY",
        meta: "Residency artist",
        selected: true,
        trailing: createElement(
          Fragment,
          null,
          createElement("small", { className: "artist-owed-chip" }, "Owed $400"),
        ),
        onSelect: () => undefined,
      }),
      createElement(ResidencyCollectionRow, {
        title: "Verify Artist 2",
        meta: "Residency artist",
        trailing: createElement("small", { className: "artist-owed-chip" }, "Owed $240"),
        onSelect: () => undefined,
      }),
    ),
  );

  return renderToStaticMarkup(createElement(
    "div",
    { className: "hfy-style-system visual-collection-canvas" },
    createElement(
      "main",
      { className: "residency-talent-body visual-collection-stage" },
      createElement(
        "div",
        { className: "artist-lookup-shell" },
        createElement("aside", { className: "artist-roster-panel" }, panel),
        createElement("section", { className: "visual-detail-placeholder", "aria-hidden": "true" }),
      ),
    ),
  ));
}

async function fixtureDocument() {
  const [tokens, globals, pilot, font] = await Promise.all([
    readFile(new URL("../src/app/hfy-design-tokens.css", import.meta.url), "utf8"),
    readFile(new URL("../src/app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../src/app/hfy-style-pilot.css", import.meta.url), "utf8"),
    readFile(new URL("../node_modules/next/dist/next-devtools/server/font/geist-latin.woff2", import.meta.url)),
  ]);
  const localGlobals = globals.replace(/^@import[^;]+;\s*/m, "");
  const fixtureStyles = `
    @font-face { font-family: VisualGeist; src: url(data:font/woff2;base64,${font.toString("base64")}) format("woff2"); font-weight: 100 900; font-style: normal; }
    :root { --hfy-font-sans: VisualGeist, Arial, sans-serif; }
    html, body { min-height: 100%; }
    body { background: #e9edef; font-family: VisualGeist, Arial, sans-serif; }
    .visual-collection-canvas { min-height: 100vh; padding: 48px; background: linear-gradient(145deg, #e6ecef, #eef0ef 53%, #d9e0e4); }
    .visual-collection-stage { width: calc(100vw - 347px); container-name: residency-talent-workspace; container-type: inline-size; }
    .visual-detail-placeholder { min-height: 680px; border: 1px solid var(--hfy-line); border-radius: var(--hfy-surface-card-radius); background: rgba(255, 255, 255, .42); }
    @media (max-width: 1200px) { .visual-collection-stage { width: calc(100vw - 327px); } }
  `;

  return `<!doctype html><html><head><meta charset="utf-8"><style>${tokens}\n${localGlobals}\n${pilot}\n${fixtureStyles}</style></head><body>${collectionFixture()}</body></html>`;
}

async function visualDifference(page: Page, actual: Buffer, expected: Buffer) {
  return page.evaluate(async ({ actualBase64, expectedBase64 }) => {
    const decode = (source: string) => new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = `data:image/png;base64,${source}`;
    });
    const [actualImage, expectedImage] = await Promise.all([decode(actualBase64), decode(expectedBase64)]);
    const sample = (image: HTMLImageElement) => {
      const canvas = document.createElement("canvas");
      canvas.width = 96;
      canvas.height = 60;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("Canvas 2D context is unavailable");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      return context.getImageData(0, 0, canvas.width, canvas.height).data;
    };
    const actualPixels = sample(actualImage);
    const expectedPixels = sample(expectedImage);
    let totalDifference = 0;
    let changedPixels = 0;
    for (let index = 0; index < actualPixels.length; index += 4) {
      const difference = (
        Math.abs(actualPixels[index] - expectedPixels[index])
        + Math.abs(actualPixels[index + 1] - expectedPixels[index + 1])
        + Math.abs(actualPixels[index + 2] - expectedPixels[index + 2])
      ) / 3;
      totalDifference += difference;
      if (difference > 18) changedPixels += 1;
    }
    const pixelCount = actualPixels.length / 4;
    return {
      meanDifference: totalDifference / pixelCount,
      changedPixelRatio: changedPixels / pixelCount,
    };
  }, { actualBase64: actual.toString("base64"), expectedBase64: expected.toString("base64") });
}

describe("Compact Collection Panel visual regression", () => {
  let browser: Browser;
  let page: Page;
  let html: string;

  beforeAll(async () => {
    const executable = await browserExecutable();
    browser = await chromium.launch({ headless: true, ...executable });
    page = await browser.newPage({ deviceScaleFactor: 1 });
    html = await fixtureDocument();
  }, 120_000);

  afterAll(async () => {
    await browser?.close();
  });

  it("keeps the approved anatomy, density, alignment, and pixels at 1440, 1200, and 1024", async () => {
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.setContent(html, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);

      const metrics = await page.evaluate(() => {
        const element = (selector: string) => {
          const match = document.querySelector<HTMLElement>(selector);
          if (!match) throw new Error(`Missing visual fixture selector: ${selector}`);
          return match;
        };
        const box = (selector: string) => element(selector).getBoundingClientRect();
        const style = (selector: string) => getComputedStyle(element(selector));
        const filterButtons = [...document.querySelectorAll<HTMLElement>(".residency-collection-filters button")];
        const panel = element(".residency-collection-panel");
        const panelStyle = getComputedStyle(panel);
        const search = box(".residency-collection-search input");
        const filters = box(".residency-collection-filters");
        const utility = box(".residency-collection-utility");
        const list = box(".residency-collection-list");
        const rowStyle = style(".residency-collection-row");
        return {
          panelMaxHeight: panelStyle.maxHeight,
          panelFitsWidth: panel.scrollWidth === panel.clientWidth,
          commonLeftEdges: [search.left, filters.left, utility.left, list.left],
          commonWidths: [search.width, filters.width, utility.width, list.width],
          filterWidths: filterButtons.map((button) => button.getBoundingClientRect().width),
          typography: {
            label: style(".residency-collection-search > label").fontSize,
            search: style(".residency-collection-search input").fontSize,
            filter: style(".residency-collection-filters button").fontSize,
            filterCount: style(".residency-collection-filters button strong").fontSize,
            count: style(".residency-collection-utility > span").fontSize,
            countEmphasis: style(".residency-collection-utility > span strong").fontSize,
            sortLabel: style(".residency-collection-utility label").fontSize,
            sortValue: style(".residency-collection-utility select").fontSize,
            rowTitle: style(".residency-collection-row-heading > strong").fontSize,
            rowMeta: style(".residency-collection-row-meta").fontSize,
            chip: style(".residency-collection-row .artist-owed-chip").fontSize,
          },
          controls: {
            searchHeight: search.height,
            sortWidth: box(".residency-collection-utility select").width,
            sortHeight: box(".residency-collection-utility select").height,
          },
          rowPadding: [rowStyle.paddingTop, rowStyle.paddingRight, rowStyle.paddingBottom, rowStyle.paddingLeft],
        };
      });

      expect(metrics.panelMaxHeight).toBe(viewport.maxHeight);
      expect(metrics.panelFitsWidth).toBe(true);
      expect(Math.max(...metrics.commonLeftEdges) - Math.min(...metrics.commonLeftEdges)).toBeLessThan(0.1);
      expect(Math.max(...metrics.commonWidths) - Math.min(...metrics.commonWidths)).toBeLessThan(0.1);
      expect(Math.max(...metrics.filterWidths) - Math.min(...metrics.filterWidths)).toBeLessThan(0.1);
      expect(metrics.typography).toEqual({
        label: "10px",
        search: "14px",
        filter: "10px",
        filterCount: "9px",
        count: "10px",
        countEmphasis: "12px",
        sortLabel: "10px",
        sortValue: "11px",
        rowTitle: "12px",
        rowMeta: "10px",
        chip: "9px",
      });
      expect(metrics.controls.searchHeight).toBe(44);
      expect(metrics.controls.sortWidth).toBe(118);
      expect(metrics.controls.sortHeight).toBe(36);
      expect(metrics.rowPadding).toEqual(["12px", "14px", "12px", "14px"]);

      const screenshot = await page.screenshot({ fullPage: true, animations: "disabled" });
      const baselineUrl = new URL(`residency-collection-panel-${viewport.width}.png`, baselineDirectory);
      if (process.env.UPDATE_COLLECTION_VISUALS === "1") {
        await mkdir(baselineDirectory, { recursive: true });
        await writeFile(baselineUrl, screenshot);
      }
      const baseline = await readFile(baselineUrl);
      const difference = await visualDifference(page, screenshot, baseline);
      expect(difference.meanDifference).toBeLessThan(6);
      expect(difference.changedPixelRatio).toBeLessThan(0.12);
    }
  }, 120_000);
});
