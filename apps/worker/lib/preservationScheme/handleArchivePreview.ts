import { Collection, Link, User } from "@linkwarden/prisma/client";
import { Page } from "playwright";
import { generatePreview } from "@linkwarden/lib/generatePreview";
import { createFile } from "@linkwarden/filesystem";
import { prisma } from "@linkwarden/prisma";
import {
  assertUrlIsSafeForServerSideFetch,
  UnsafeUrlError,
} from "@linkwarden/lib/ssrf";

type LinksAndCollectionAndOwner = Link & {
  collection: Collection & {
    owner: User;
  };
};

const handleArchivePreview = async (
  link: LinksAndCollectionAndOwner,
  page: Page
) => {
  const ogImageUrl = await page.evaluate(() => {
    const doc = (
      globalThis as unknown as {
        document?: {
          querySelector: (
            selector: string
          ) => { getAttribute?: (name: string) => string | null } | null;
        };
      }
    ).document;

    const selectors = [
      'meta[property="og:image"]',
      'meta[property="og:image:secure_url"]',
      'meta[name="og:image"]',
      'meta[name="twitter:image"]',
      'meta[name="twitter:image:src"]',
      'meta[name="image"]',
      'meta[itemprop="image"]',
    ];

    for (const selector of selectors) {
      const el = doc?.querySelector(selector);
      const content = el?.getAttribute?.("content");
      if (content) return content;
    }

    return null;
  });

  let previewGenerated = false;

  if (ogImageUrl) {
    if (
      !ogImageUrl.startsWith("http://") &&
      !ogImageUrl.startsWith("https://")
    ) {
      const origin = await page.evaluate(() => document.location.origin);
      ogImageUrl =
        origin + (ogImageUrl.startsWith("/") ? ogImageUrl : "/" + ogImageUrl);
    }

    const imageResponse = await page.goto(ogImageUrl);

    if (imageResponse && !link.preview?.startsWith("archive")) {
      const buffer = await imageResponse.body();
      previewGenerated = await generatePreview(
        buffer,
        link.collectionId,
        link.id
      );
    }

    await page.goBack();
  }

  if (!previewGenerated && !link.preview?.startsWith("archive")) {
    console.log("Falling back to screenshot preview");
    await page
      .screenshot({ type: "jpeg", quality: 20 })
      .then(async (screenshot) => {
        if (
          Buffer.byteLength(screenshot) >
          1024 * 1024 * Number(process.env.PREVIEW_MAX_BUFFER || 10)
        )
          return console.log("Error generating preview: Buffer size exceeded");

        await createFile({
          data: screenshot,
          filePath: `archives/preview/${link.collectionId}/${link.id}.jpeg`,
        });

        await prisma.link.update({
          where: { id: link.id },
          data: {
            preview: `archives/preview/${link.collectionId}/${link.id}.jpeg`,
          },
        });
      });
  }
};

export default handleArchivePreview;
