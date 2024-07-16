import PocketBase from "pocketbase";

export const pocketbase = new PocketBase(import.meta.env.PUBLIC_POCKETBASE_URL)