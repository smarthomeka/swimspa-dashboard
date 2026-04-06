#!/bin/sh
set -e

# Ensure data directory exists and is writable
mkdir -p /app/data

exec "$@"
