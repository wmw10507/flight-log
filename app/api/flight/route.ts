import { NextRequest, NextResponse } from "next/server";

const APPS_SCRIPT_URL =
  process.env.APPS_SCRIPT_URL;

const API_KEY =
  process.env.FLIGHT_LOG_API_KEY;

// Official imports must use their dedicated, gated endpoint.
const ALLOWED_ACTIONS = new Set([
  "getAppData", "savePostFlight", "getHistoryMonth", "getRecencyData",
  "getCaptainCard", "getCaptains", "getCaptainProfile", "saveCaptainProfile",
]);


export async function POST(
  request: NextRequest
) {
  try {
    const body = await request.json();
    if (!body || typeof body.action !== "string" || !ALLOWED_ACTIONS.has(body.action)) {
      return NextResponse.json(
        { error: "Action is not allowed through the Flight API." },
        { status: 403 }
      );
    }

    if (!APPS_SCRIPT_URL) {
      throw new Error(
        "APPS_SCRIPT_URL is not configured."
      );
    }

    if (!API_KEY) {
      throw new Error(
        "FLIGHT_LOG_API_KEY is not configured."
      );
    }

    const response =
      await fetch(
        APPS_SCRIPT_URL,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            ...body,
            apiKey: API_KEY,
          }),

          redirect: "follow",

          cache: "no-store",
        }
      );


    const text =
      await response.text();


    let result;

    try {
        result = JSON.parse(text);
    } catch {
        console.error(
            "Apps Script raw response:",
            text.slice(0, 500)
    );

    throw new Error(
    "Apps Script returned a non-JSON response."
     ); 
    }


    if (!result.ok) {
      throw new Error(
        result.error ||
        "Apps Script request failed."
      );
    }


    return NextResponse.json(
      result.data
    );

  } catch (error) {
    console.error(
      "Flight API error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unknown error",
      },
      {
        status: 500,
      }
    );
  }
}
