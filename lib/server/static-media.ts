import type { PagesFunction } from "@cloudflare/workers-types";
import type { Env } from "../../functions/api/[[path]]";
import photos from "../../data/photos.json";

export const staticMedia: PagesFunction<Env> = async (context) => {
  const pathname = decodeURIComponent(new URL(context.request.url).pathname);
  const photo = photos.photos.find((p) => p.url === pathname || p.thumbnail === pathname);
  if (photo && context.env.PHOTO_DB) {
    const deleted = await context.env.PHOTO_DB.prepare("SELECT id FROM photos WHERE id = ? AND deleted = 1").bind(photo.id).first();
    if (deleted) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } }) as unknown as import("@cloudflare/workers-types").Response;
  }
  const response = await context.next();
  response.headers.set("Cache-Control", "public, max-age=0, must-revalidate");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
};
