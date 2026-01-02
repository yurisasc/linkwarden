import {
  chromium,
  devices,
  type Browser,
  type LaunchOptions,
  type BrowserContextOptions,
} from "playwright";
import axios from "axios";

export function getBrowserOptions(): LaunchOptions {
  let browserOptions: LaunchOptions = {
    // headless: false,
  };

  if (process.env.PROXY) {
    browserOptions.proxy = {
      server: process.env.PROXY,
      bypass: process.env.PROXY_BYPASS,
      username: process.env.PROXY_USERNAME,
      password: process.env.PROXY_PASSWORD,
    };
  }

  if (
    process.env.PLAYWRIGHT_LAUNCH_OPTIONS_EXECUTABLE_PATH &&
    !process.env.PLAYWRIGHT_WS_URL
  ) {
    browserOptions.executablePath =
      process.env.PLAYWRIGHT_LAUNCH_OPTIONS_EXECUTABLE_PATH;
  }

  return browserOptions;
}

export async function solveCaptcha(
  url: string,
  maxTimeout: number = 60000
): Promise<{
  status: string;
  userAgent?: string;
  solution?: {
    cookies: {
      name: string;
      value: string;
      domain: string;
      path: string;
      secure: boolean;
      expires?: number;
      httpOnly?: boolean;
      sameSite?: "Strict" | "Lax" | "None";
    }[];
    response?: string;
  };
}> {
  if (process.env.FLARESOLVERR_URL) {
    try {
      console.info(`Calling FlareSolverr for ${url}...`);
      const flareSolverrUrl = process.env.FLARESOLVERR_URL.endsWith("/v1")
        ? process.env.FLARESOLVERR_URL
        : `${process.env.FLARESOLVERR_URL.replace(/\/$/, "")}/v1`;

      const response = await axios.post(
        flareSolverrUrl,
        {
          cmd: "request.get",
          url,
          maxTimeout,
        },
        {
          headers: { "Content-Type": "application/json" },
        }
      );

      if (response.status !== 200) {
        console.error(`FlareSolverr returned status ${response.status}`);
        return { status: "fail" };
      }

      console.info(`FlareSolverr status: ${response.data.status}`);
      return {
        status: response.data.status,
        solution: response.data.solution,
        userAgent: response.data.solution?.userAgent,
      };
    } catch (error) {
      console.error("Error during captcha solving:", error);
      return { status: "error" };
    }
  }

  return { status: "skip" };
}

export function getDefaultContextOptions(): BrowserContextOptions {
  const base: BrowserContextOptions = {
    ...devices["Desktop Chrome"],
    ignoreHTTPSErrors: process.env.IGNORE_HTTPS_ERRORS === "true",
  };

  if (process.env.PLAYWRIGHT_WS_URL) {
    const launchLike = getBrowserOptions();
    return {
      ...base,
      ...(launchLike as unknown as Partial<BrowserContextOptions>),
    };
  }

  return base;
}

export async function launchBrowser(): Promise<Browser> {
  const browserOptions = getBrowserOptions();

  if (process.env.PLAYWRIGHT_WS_URL) {
    return chromium.connectOverCDP(process.env.PLAYWRIGHT_WS_URL);
  }

  return chromium.launch(browserOptions);
}
