import { Server } from "@hocuspocus/server";

const server = new Server({
  name: "hocuspocus-local",
  port: 1234
});

server.listen();