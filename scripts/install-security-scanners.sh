#!/bin/sh
set -eu
scanner_dir="${1:?Pass scanner output directory}"
mkdir -p "$scanner_dir"
scanner_dir="$(cd "$scanner_dir" && pwd)"
scanner_tmp="$(mktemp -d)"
trap 'rm -rf "$scanner_tmp"' EXIT
cd "$scanner_tmp"
curl -fsSLO https://github.com/gitleaks/gitleaks/releases/download/v8.24.3/gitleaks_8.24.3_linux_x64.tar.gz
curl -fsSLO https://github.com/gitleaks/gitleaks/releases/download/v8.24.3/gitleaks_8.24.3_checksums.txt
sha256sum --check --ignore-missing gitleaks_8.24.3_checksums.txt
tar -xzf gitleaks_8.24.3_linux_x64.tar.gz -C "$scanner_dir" gitleaks
curl -fsSLO https://github.com/aquasecurity/trivy/releases/download/v0.75.0/trivy_0.75.0_Linux-64bit.tar.gz
curl -fsSLO https://github.com/aquasecurity/trivy/releases/download/v0.75.0/trivy_0.75.0_checksums.txt
sha256sum --check --ignore-missing trivy_0.75.0_checksums.txt
tar -xzf trivy_0.75.0_Linux-64bit.tar.gz -C "$scanner_dir" trivy
