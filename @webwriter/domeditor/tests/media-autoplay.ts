const assert = (condition: unknown, message: string) => { if(!condition) throw new Error(message) }
const waitFor = async (condition: () => boolean, message: string) => {
  for(let attempt = 0; attempt < 100; attempt++) {
    if(condition()) return
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  assert(false, message)
}

export async function checkMediaAutoplay() {
  // Local PCM silence gives both native media elements a real decodable source.
  const wav = new Uint8Array(44 + 16000)
  const header = new DataView(wav.buffer)
  const text = (offset: number, value: string) => [...value].forEach((character, index) => wav[offset + index] = character.charCodeAt(0))
  text(0, "RIFF"); header.setUint32(4, wav.length - 8, true); text(8, "WAVEfmt ")
  header.setUint32(16, 16, true); header.setUint16(20, 1, true); header.setUint16(22, 1, true)
  header.setUint32(24, 8000, true); header.setUint32(28, 8000, true)
  header.setUint16(32, 1, true); header.setUint16(34, 8, true)
  text(36, "data"); header.setUint32(40, 16000, true); wav.fill(128, 44)
  const source = URL.createObjectURL(new Blob([wav], {type: "audio/wav"}))
  const frame = document.createElement("iframe")
  const saved = document.createElement("iframe")
  frame.srcdoc = '<!doctype html><body><p>Ready</p><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></body>'
  document.body.append(frame)
  try {
    await waitFor(() => Boolean(frame.contentWindow?.editor), "autoplay fixture did not initialize")
    const editor = frame.contentWindow!.editor!, doc = frame.contentDocument!
    const media = editor.features.media
    const widget = doc.createElement("autoplay-test-widget")
    widget.innerHTML = `<section><!--keep--><audio controls autoplay muted loop src="${source}"></audio><video controls autoplay muted loop src="${source}"></video></section>`
    const players = [...widget.querySelectorAll<HTMLMediaElement>("audio, video")]
    let plays = 0
    players.forEach(player => {
      player.muted = true
      player.addEventListener("play", () => plays++)
    })
    doc.body.append(widget)
    await waitFor(() => players.every(player => player.readyState === 4), "editing media did not load")
    await new Promise(resolve => setTimeout(resolve, 150))
    assert(players.every(player => player.paused && player.autoplay), "inserted media autoplayed or lost its attribute")
    assert(plays === 0, "insertion briefly started playback")

    for(const player of players) {
      for(let toggle = 0; toggle < 3; toggle++) {
        player.removeAttribute("autoplay")
        await new Promise(resolve => setTimeout(resolve, 0))
        player.setAttribute("autoplay", "autoplay")
        player.load()
        await waitFor(() => player.readyState === 4, "reloaded media did not load")
      }
      assert(player.paused && player.autoplay, "toggling or load() enabled autoplay")
      await player.play()
      assert(!player.paused, "explicit playback was blocked")
      player.setAttribute("autoplay", "")
      await new Promise(resolve => setTimeout(resolve, 50))
      assert(!player.paused, "an attribute change interrupted explicit playback")
      player.pause()
      player.src = source + "#replacement"
      await waitFor(() => player.readyState === 4, "replacement source did not load")
      await new Promise(resolve => setTimeout(resolve, 50))
      assert(player.paused, "a source replacement enabled autoplay")
    }
    assert(plays === 2, "automatic playback occurred during editing")

    const clone = widget.cloneNode(true) as HTMLElement
    const clonedPlayers = [...clone.querySelectorAll<HTMLMediaElement>("audio, video")]
    clonedPlayers.forEach(player => player.muted = true)
    doc.body.append(clone)
    await waitFor(() => clonedPlayers.every(player => player.readyState === 4), "cloned media did not load")
    assert(clonedPlayers.every(player => player.paused && player.autoplay), "cloning enabled autoplay")

    const html = editor.toHTML()
    assert(html.includes("autoplay"), "serialization lost autoplay")
    saved.srcdoc = html
    document.body.append(saved)
    await waitFor(() => Boolean(saved.contentDocument?.querySelector("audio")), "saved document did not load")
    const savedPlayers = [...saved.contentDocument!.querySelectorAll<HTMLMediaElement>("audio, video")]
    await waitFor(() => savedPlayers.every(player => !player.paused), "saved media did not autoplay")

    media.disable()
    players.forEach(player => player.load())
    await waitFor(() => players.every(player => !player.paused), "disabled feature still suppressed autoplay")
    media.enable()
    assert(players.every(player => player.paused && player.autoplay), "enabling editing did not pause existing media")
  }
  finally {
    frame.contentWindow?.editor?.destroy()
    frame.remove()
    saved.remove()
    URL.revokeObjectURL(source)
  }
}
