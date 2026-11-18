# iPad development

Run the local WebWriter editor in Safari on a real iPad and inspect it from a Mac. The USB setup below works even on Wi-Fi networks that prevent the iPad from reaching the Mac directly. It uses the free, open-source [iSH app](https://ish.app/).

Use this for an explicitly authorized personal-device SSH tunnel. Keep the development server bound to loopback and preserve its Host/Origin checks. For a shared testing environment, use the separate [VPN-only private-testing setup](PRIVATE-TESTING.md).

## Everyday use after setup

1. Start the development server on the Mac. From the repository root:

   ```sh
   cd @webwriter/domeditor
   npm start
   ```

2. Connect the paired iPad to the Mac with a USB cable, unlock it, and open iSH. The helper starts with its login shell; the Mac's startup agent reconnects the tunnel automatically.
3. Open **http://127.0.0.1:1234/editor/index.html** in iPad Safari. Keep iSH running; it can remain in the background once its Always location permission is enabled.

The explicit `index.html` avoids an empty 404 page if Safari opens `/editor` without the trailing slash. Reopen iSH after an iPad reboot or force quit. The Mac must be awake, its user logged in, and the development server running.

## One-time setup

You need a Mac with the repository's development dependencies installed, Homebrew, a USB cable, and iSH on the iPad. Pair the devices by connecting the cable, unlocking the iPad, and accepting **Trust This Computer** when prompted.

### 1. Prepare the Mac

Run these commands from the repository root in a Mac Terminal window:

```sh
brew install libusbmuxd
umask 077
ipad_tunnel_dir="$HOME/Library/Application Support/WebWriter/iPadTunnel"
mkdir -p "$ipad_tunnel_dir"
chmod 700 "$ipad_tunnel_dir"
cp @webwriter/domeditor/scripts/ipad-usb-tunnel.sh "$ipad_tunnel_dir/tunnel.sh"
chmod 700 "$ipad_tunnel_dir/tunnel.sh"
test -f "$ipad_tunnel_dir/id_ed25519" ||
  ssh-keygen -t ed25519 -C webwriter-ipad-usb-forward-only -f "$ipad_tunnel_dir/id_ed25519"
cat "$ipad_tunnel_dir/id_ed25519.pub"
```

The dedicated key must be usable without a passphrase prompt, or unlocked in an available SSH agent, for unattended reconnection. Keep the private key on the Mac. Copy the complete **public** key line printed by the last command; you will add it to iSH below.

Find the iPad's UDID in Finder: select the iPad under Locations, click the information below its name to show the device ID, then Control-click the identifier and copy it. See [Apple's device-ID instructions](https://help.apple.com/xcode/mac/current/en.lproj/dev93ef696c6.html). In the same Terminal window, replace this placeholder:

```sh
ipad_udid='REPLACE_WITH_YOUR_IPAD_UDID'
```

Keep that Terminal window open for the remaining Mac commands.

### 2. Prepare iSH

In iSH, install the SSH server and create its Ed25519 host key if needed:

```sh
apk update
apk add openssh
mkdir -p "$HOME/.ssh" /run/sshd
chmod 700 "$HOME/.ssh"
test -f /etc/ssh/ssh_host_ed25519_key ||
  ssh-keygen -q -t ed25519 -N '' -f /etc/ssh/ssh_host_ed25519_key
```

Save [`scripts/ish-tunnel.sh`](../scripts/ish-tunnel.sh) from this package into **Files → On My iPad → iSH → root** as `webwriter-tunnel.sh`. AirDrop the file or copy its contents with [Universal Clipboard](https://support.apple.com/en-gb/102430). If you saved it elsewhere, move it into iSH's root folder before continuing.

Create the forwarding key file, replacing `PASTE_MAC_PUBLIC_KEY_HERE` with the complete public key line from step 1. Keep the restriction options before the key, on the same line:

```sh
cat > "$HOME/.ssh/webwriter-usb-authorized_keys" <<'KEY'
restrict,port-forwarding,command="/bin/false",permitlisten="localhost:1234" PASTE_MAC_PUBLIC_KEY_HERE
KEY
chmod 600 "$HOME/.ssh/webwriter-usb-authorized_keys"
chmod 700 "$HOME/webwriter-tunnel.sh"
```

This key permits the editor's remote forward, with no interactive shell or command execution. The helper's SSH listener also disables password login and allows only remote TCP forwarding to `localhost:1234`.

### 3. Enable background operation and startup

Trigger iSH's location permission prompt:

```sh
cat /dev/location > /dev/null &
location_setup_pid=$!
```

Allow location access, then choose **Settings → Privacy & Security → Location Services → iSH → Always**. Return to iSH and stop this one-time reader:

```sh
kill "$location_setup_pid"
```

The helper starts its own reader using iSH's documented [/dev/location mechanism](https://github.com/ish-app/ish/wiki/Running-in-background). Location updates keep the app active in the background and consume device resources; iPadOS can still terminate it.

Add the startup hook once and start the helper now:

```sh
line='WEBWRITER_TUNNEL_MODE=usb "$HOME/webwriter-tunnel.sh" start'
touch "$HOME/.profile"
grep -Fqx "$line" "$HOME/.profile" || printf '\n%s\n' "$line" >> "$HOME/.profile"
WEBWRITER_TUNNEL_MODE=usb "$HOME/webwriter-tunnel.sh" start
ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
```

Keep iSH visible until setup is complete. Note the host-key fingerprint printed by the last command.

### 4. Verify the USB connection and iPad host key

On the Mac, run:

```sh
iproxy -l -s 127.0.0.1 -u "$ipad_udid" 22223:2223
```

Leave it running. In a **second Mac Terminal window**, scan the public host key:

```sh
ipad_tunnel_dir="$HOME/Library/Application Support/WebWriter/iPadTunnel"
ssh-keyscan -T 5 -p 22223 -t ed25519 127.0.0.1 > "$ipad_tunnel_dir/scanned_host_key"
ssh-keygen -lf "$ipad_tunnel_dir/scanned_host_key"
```

Compare that fingerprint with the one displayed in iSH. After they match, pin the key under the alias used by the Mac helper:

```sh
awk '$2 == "ssh-ed25519" {$1 = "webwriter-ipad-usb"; print}' \
  "$ipad_tunnel_dir/scanned_host_key" > "$ipad_tunnel_dir/known_hosts"
chmod 600 "$ipad_tunnel_dir/known_hosts"
```

Stop the manual `iproxy` process with Control-C. Return to the **first Mac Terminal window**, which still has `ipad_tunnel_dir` and `ipad_udid` set, and test the helper:

```sh
"$ipad_tunnel_dir/tunnel.sh" "$ipad_tunnel_dir" "$ipad_udid" "$(command -v iproxy)"
```

With `npm start` running on the Mac, open **http://127.0.0.1:1234/editor/index.html** on the iPad. Check that both the toolbar and editing page appear, then switch away from iSH to verify background operation. Stop the manual helper with Control-C before the next step.

### 5. Reconnect automatically on the Mac

In that first Mac Terminal window, create a per-user launch agent using macOS's built-in `plutil`. Do this once; to change an existing agent, unload and edit it instead of recreating it.

```sh
umask 077
mkdir -p "$HOME/Library/LaunchAgents"
agent="$HOME/Library/LaunchAgents/app.webwriter.ipad-usb-tunnel.plist"
plutil -create xml1 "$agent"
plutil -insert Label -string app.webwriter.ipad-usb-tunnel "$agent"
plutil -insert ProgramArguments -array "$agent"
plutil -insert ProgramArguments.0 -string /bin/sh "$agent"
plutil -insert ProgramArguments.1 -string "$ipad_tunnel_dir/tunnel.sh" "$agent"
plutil -insert ProgramArguments.2 -string "$ipad_tunnel_dir" "$agent"
plutil -insert ProgramArguments.3 -string "$ipad_udid" "$agent"
plutil -insert ProgramArguments.4 -string "$(command -v iproxy)" "$agent"
plutil -insert RunAtLoad -bool YES "$agent"
plutil -insert KeepAlive -bool YES "$agent"
plutil -insert ThrottleInterval -integer 10 "$agent"
plutil -insert ProcessType -string Background "$agent"
plutil -insert StandardOutPath -string "$ipad_tunnel_dir/tunnel.log" "$agent"
plutil -insert StandardErrorPath -string "$ipad_tunnel_dir/tunnel.log" "$agent"
chmod 600 "$agent"
plutil -lint "$agent"
launchctl bootstrap "gui/$(id -u)" "$agent"
```

The agent runs while the Mac user is logged in. It retries after the cable is reconnected, the Mac wakes, or iSH becomes available again. Existing connections use SSH keepalive probes to detect a broken link after roughly 45 seconds.

## Inspect Safari on the iPad

Enable **Settings → Apps → Safari → Advanced → Web Inspector** on the iPad. On the Mac, enable **Safari → Settings → Advanced → Show features for web developers**. Choose the iPad's local WebWriter page from Safari's **Develop** menu, or open **Develop → Inspect Apps and Devices** and select it there. [Apple's inspection guide](https://developer.apple.com/documentation/safari-developer-tools/inspecting-ios) covers the current controls.

Keep iPad Safari in the foreground while reproducing browser behavior. Capture permission prompts and device rotation still require action on the iPad. For capture issues, compare the live preview, saved screenshot, and saved video in portrait and landscape; a working mock-media test does not reproduce the physical device's capture pipeline.

## Status, logs, and stopping

On iSH:

```sh
~/webwriter-tunnel.sh status
tail -n 20 ~/.local/state/webwriter-tunnel/tunnel.log
~/webwriter-tunnel.sh stop
```

Stopping closes the listener, its accepted tunnel sessions, and the helper's location reader. Other manually started readers are unaffected. Remove the helper's line from `~/.profile` to disable its startup.

On the Mac:

```sh
launchctl print "gui/$(id -u)/app.webwriter.ipad-usb-tunnel"
tail -n 20 "$HOME/Library/Application Support/WebWriter/iPadTunnel/tunnel.log"
launchctl bootout "gui/$(id -u)/app.webwriter.ipad-usb-tunnel"
```

`bootout` stops the current agent. Delete its plist from `~/Library/LaunchAgents/` to disable startup at future logins. To resume an installed agent, use the `launchctl bootstrap` command from setup.

A running helper does not by itself mean the tunnel is connected or WebWriter is running. The complete check is to open the editor in iPad Safari.

## Troubleshooting

- **An empty page at `/editor`:** use `/editor/index.html` or retain the trailing slash in `/editor/`.
- **Connection refused:** check the USB cable and pairing, open iSH, start its helper, and check that the Mac development server is running. After iSH was force-quit or suspended without background permission, reopening it starts a fresh listener.
- **Permission denied (publickey):** check the complete public-key line and the permissions on `/root`, `/root/.ssh`, and its key file. The directories must belong to root and must not be writable by other users.
- **A locked iSH root account:** iSH's fresh root account may be locked even for key login. Check without displaying its password hash:

  ```sh
  awk -F: '$1 == "root" {print "root locked:", $2 ~ /^!/}' /etc/shadow
  ```

  If it prints `root locked: 1`, iSH documents `echo 'root:*' | chpasswd -e` as a fix. It replaces iSH's locked password entry with an unusable password hash so public-key authentication can work. This changes the Linux account inside iSH, not the iPadOS account. See [iSH's passwordless-login troubleshooting](https://github.com/ish-app/ish/wiki/Running-an-SSH-server#troubleshooting-passwordless-login).
- **Host key verification failed:** compare the iPad's fingerprint again and check the `webwriter-ipad-usb` entry. The Mac helper quotes the known-hosts path because `Application Support` contains a space; preserve that quoting if adapting it.
- **iSH pauses in the background:** verify its location permission is Always and restart the helper. Merely detaching a shell process does not prevent iPadOS from suspending the app.

## Connection layout

| Endpoint | Purpose |
| --- | --- |
| Mac `127.0.0.1:1234` | Unmodified WebWriter development server. |
| Mac `127.0.0.1:22223` | USB forward to the paired iPad's SSH listener. |
| iPad `127.0.0.1:2223` | Key-only SSH listener owned by the iSH helper. |
| iPad `localhost:1234` and `127.0.0.1:1234` | Reverse SSH forward to the Mac's development server. |

The application uses `127.0.0.1` and its content frames use `localhost`. They share the forwarded port while keeping separate origins. Keep both working; do not collapse the frame and application origins or expose the Node server on the LAN.
