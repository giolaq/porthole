#!/usr/bin/env bash
# Runs inside reactivecircus/android-emulator-runner's `script:`. That runner
# executes each script LINE in a separate shell, so the action invokes this
# file as a single line and all multi-line logic lives here.
set -euo pipefail

porthole_cli="$RUNNER_TEMP/porthole-cli"
printf '#!/usr/bin/env bash\nset -euo pipefail\n%s "$@"\n' "$PORTHOLE_COMMAND" > "$porthole_cli"
chmod +x "$porthole_cli"
export PORTHOLE_CLI="$porthole_cli"

session_json="$RUNNER_TEMP/porthole-session.json"
"$PORTHOLE_CLI" start --device emulator-5554 --detach -q --no-preview -p "$PORTHOLE_PORT" > "$session_json"

json_field() {
  node -p 'JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"))[process.argv[2]] ?? ""' "$session_json" "$1"
}

PORTHOLE_URL="$(json_field url)"
PORTHOLE_SERIAL="$(json_field serial)"
PORTHOLE_PORT="$(json_field port)"
export PORTHOLE_URL PORTHOLE_SERIAL PORTHOLE_PORT

{
  echo "url=$PORTHOLE_URL"
  echo "serial=$PORTHOLE_SERIAL"
  echo "port=$PORTHOLE_PORT"
} >> "$GITHUB_OUTPUT"
{
  echo "PORTHOLE_URL=$PORTHOLE_URL"
  echo "PORTHOLE_SERIAL=$PORTHOLE_SERIAL"
  echo "PORTHOLE_PORT=$PORTHOLE_PORT"
} >> "$GITHUB_ENV"

user_script="$RUNNER_TEMP/porthole-user-script.sh"
printf '%s\n' "$PORTHOLE_USER_SCRIPT" > "$user_script"

set +e
bash -euo pipefail "$user_script"
status=$?
set -e

"$PORTHOLE_CLI" kill -q || true
exit "$status"
