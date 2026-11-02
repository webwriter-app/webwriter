// This relay handles connection setup only. It never accepts session documents,
// activity, or feedback; SDP and ICE candidates are encrypted by the peers.
const identifier = value => typeof value === "string" && /^[A-Za-z0-9_-]{16,128}$/.test(value)
const publicKey = value => typeof value === "string" && /^[A-Za-z0-9_-]{87}$/.test(value)
const ciphertext = value => typeof value === "string" && /^[A-Za-z0-9_-]{1,48000}$/.test(value)

export function installLiveSignaling(server) {
  const rooms = new Map()
  server.on("connection", socket => {
    let room, peer, role
    const registrationTimeout = setTimeout(() => { if(!role) socket.close(1008, "Registration timed out") }, 10000)
    registrationTimeout.unref?.()
    socket.on("error", () => {})
    socket.on("message", data => {
      try {
        const message = JSON.parse(data.toString())
        if(!role) {
          if(!identifier(message.room)) throw Error("Invalid room")
          if(message.type === "host") {
            if(rooms.has(message.room) || rooms.size >= 128) throw Error("Host unavailable")
            room = {id: message.room, host: socket, peers: new Map()}
            rooms.set(room.id, room)
            role = "host"
          }
          else if(message.type === "join" && identifier(message.peer) && publicKey(message.key)) {
            room = rooms.get(message.room)
            if(!room || room.peers.has(message.peer) || room.peers.size >= 100) throw Error("Host unavailable")
            peer = message.peer
            role = "learner"
            room.peers.set(peer, socket)
            room.host.send(JSON.stringify({type: "join", peer, key: message.key}))
          }
          else throw Error("Invalid registration")
          clearTimeout(registrationTimeout)
          socket.send(JSON.stringify({type: "ready"}))
          return
        }
        if(message.type !== "signal" || !ciphertext(message.data)) throw Error("Invalid signal")
        if(role === "host") {
          if(!identifier(message.peer)) throw Error("Invalid peer")
          const target = room.peers.get(message.peer)
          if(target?.readyState === 1) target.send(JSON.stringify({type: "signal", data: message.data}))
        }
        else if(room.host.readyState === 1) room.host.send(JSON.stringify({type: "signal", peer, data: message.data}))
      }
      catch { socket.close(1008, "Invalid signaling message") }
    })
    socket.on("close", () => {
      clearTimeout(registrationTimeout)
      if(role === "host" && rooms.get(room.id) === room) {
        rooms.delete(room.id)
        for(const learner of room.peers.values()) learner.close(1012, "Host disconnected")
      }
      if(role === "learner" && room.peers.get(peer) === socket) {
        room.peers.delete(peer)
        if(room.host.readyState === 1) room.host.send(JSON.stringify({type: "leave", peer}))
      }
    })
  })
}
