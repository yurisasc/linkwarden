import { Collection, Link, User } from "@linkwarden/prisma/client";
import { Page } from "playwright";
import { generatePreview } from "@linkwarden/lib";
import { createFile } from "@linkwarden/filesystem";
import { prisma } from "@linkwarden/prisma";

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
    const selectors = [
      'meta[property="og:image"]',
      'meta[name="og:image"]',
      'meta[property="twitter:image"]',
      'meta[name="twitter:image"]',
      'meta[name="image"]',
    ];
    for (const selector of selectors) {
      const metaTag = document.querySelector(selector);
      if (metaTag && (metaTag as any).content) {
        return (metaTag as any).content;
      }
    }
    return null;
  });

  let previewGenerated = false;

  if (ogImageUrl) {
    console.info(`Found og:image: ${ogImageUrl}`);
    let absoluteOgImageUrl = ogImageUrl;
    if (
      !ogImageUrl.startsWith("http://") &&
      !ogImageUrl.startsWith("https://")
    ) {
      const origin = await page.evaluate(() => document.location.origin);
      absoluteOgImageUrl =
        origin + (ogImageUrl.startsWith("/") ? ogImageUrl : "/" + ogImageUrl);
    }

    try {
      const imageResponse = await page.context.request.get(absoluteOgImageUrl);

      if (imageResponse.ok() && !link.preview?.startsWith("archive")) {
        const buffer = await imageResponse.body();
        previewGenerated = await generatePreview(
          buffer,
          link.collectionId,
          link.id
        );
        if (previewGenerated) {
          console.info("Successfully generated preview from og:image");
        }
      } else {
        console.warn(
          `Failed to fetch og:image. Status: ${imageResponse.status()}`
        );
      }
    } catch (error) {
      console.error(`Error fetching og:image: ${error}`);
    }
  }

  if (!previewGenerated && !link.preview?.startsWith("archive")) {
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
