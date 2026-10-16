#!/usr/bin/env bash
set -euo pipefail

package_name=com.giolaq.rntvosapp
repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
porthole_cmd=(node "$repo_root/packages/porthole/dist/cli.js")
if [[ -n ${PORTHOLE_BIN:-} ]]; then
  porthole_cmd=("$PORTHOLE_BIN")
fi

"${porthole_cmd[@]}" stop-app "$package_name" "$@"
"${porthole_cmd[@]}" clear-app "$package_name" "$@"
"${porthole_cmd[@]}" launch "$package_name" "$@"
