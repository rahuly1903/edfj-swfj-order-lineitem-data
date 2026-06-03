import { NextResponse } from "next/server";

const SHOPIFY_API_VERSION = process.env.YEAR || process.env.SHOPIFY_API_VERSION;

function getCredentialsFromStore(store) {
  const s = (store || "").toLowerCase();
  if (s.includes("enchanted") && s.includes("uk")) {
    return {
      accessToken: process.env.SHOPIFY_ACCESS_TOKEN_EDFJ_UK,
      storeDomain: process.env.SHOPIFY_STORE_DOMAIN_EDFJ_UK,
    };
  }
  if (s.includes("enchanted")) {
    return {
      accessToken: process.env.SHOPIFY_ACCESS_TOKEN_EDFJ,
      storeDomain: process.env.SHOPIFY_STORE_DOMAIN_EDFJ,
    };
  }
  if (s.includes("starwars")) {
    return {
      accessToken: process.env.SHOPIFY_ACCESS_TOKEN_SWFJ,
      storeDomain: process.env.SHOPIFY_STORE_DOMAIN_SWFJ,
    };
  }
  return null;
}

function getCredentialsFromOrigin(origin, referer) {
  const o = (origin || "").toLowerCase();
  const r = (referer || "").toLowerCase();
  if (o.includes("enchantedfinejewelry") || r.includes("enchantedfinejewelry")) {
    return {
      accessToken: process.env.SHOPIFY_ACCESS_TOKEN_EDFJ,
      storeDomain: process.env.SHOPIFY_STORE_DOMAIN_EDFJ,
    };
  }
  if (o.includes("starwarsfinejewelry") || r.includes("starwarsfinejewelry")) {
    return {
      accessToken: process.env.SHOPIFY_ACCESS_TOKEN_SWFJ,
      storeDomain: process.env.SHOPIFY_STORE_DOMAIN_SWFJ,
    };
  }
  return null;
}

async function updateCustomerTags(customerId, tagsArray, accessToken, storeDomain) {
  const url = `https://${storeDomain}/admin/api/${SHOPIFY_API_VERSION}/customers/${customerId}.json`;
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      "X-Shopify-Access-Token": accessToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      customer: {
        id: String(customerId),
        tags: tagsArray.join(", "),
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Shopify API error: ${response.status} ${text}`);
  }

  const data = await response.json();
  return data.customer;
}

export async function POST(request) {
  try {
    const origin = request.headers.get("origin") || "";
    const referer = request.headers.get("referer") || "";
    const body = await request.json();
    const { customerId, tags, store: bodyStore } = body;

    if (!customerId) {
      return NextResponse.json(
        { error: "customerId is required" },
        { status: 400 }
      );
    }

    let credentials =
      getCredentialsFromStore(bodyStore) ||
      getCredentialsFromOrigin(origin, referer);

    if (!credentials?.accessToken || !credentials?.storeDomain) {
      return NextResponse.json(
        { error: "Forbidden: Invalid origin or store. Provide store in body (e.g. edfj, swfj) or call from allowed origin." },
        { status: 403 }
      );
    }

    let currentTags = [];
    if (typeof tags === "undefined" || tags === null) {
      currentTags = [];
    } else if (Array.isArray(tags)) {
      currentTags = tags
        .map((t) => String(t).trim())
        .filter((t) => t.length > 0);
    } else if (typeof tags === "string") {
      currentTags = tags
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
    } else {
      return NextResponse.json(
        { error: "tags must be a string or an array" },
        { status: 400 }
      );
    }

    const hasHASAC = currentTags.includes("HASAC");
    if (hasHASAC) {
      return NextResponse.json({
        success: true,
        updated: false,
        message:
          "Customer already has HASAC tag (from request tags)",
        tags: currentTags,
        customerId,
      });
    }

    const newTags = Array.from(new Set([...currentTags, "HASAC"]));
    const updatedCustomer = await updateCustomerTags(
      customerId,
      newTags,
      credentials.accessToken,
      credentials.storeDomain
    );

    return NextResponse.json({
      success: true,
      updated: true,
      message: "HASAC tag added to customer",
      tags: newTags,
      customerId: updatedCustomer?.id ?? customerId,
    });
  } catch (error) {
    console.error("Error in /api/add-hasac:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error.message,
      },
      { status: 500 }
    );
  }
}
