#!/bin/sh
# SPDX-License-Identifier: Apache-2.0
# Licensed to the Ed-Fi Alliance under one or more agreements.
# The Ed-Fi Alliance licenses this file to you under the Apache License, Version 2.0.
# See the LICENSE and NOTICES files in the project root for more information.
#
# Mirrors compose/DB-Ods/init.sh's approach (generic postgres image + restore
# user-supplied .sql files on first start) for the Admin/Security databases,
# so this image is PVC-safe the same way: unlike the vendor
# edfialliance/ods-admin-api-db image (which bakes an already-initialized
# PGDATA into the image layer, and relies on Docker's copy-on-first-use volume
# semantics), this one runs a normal `initdb` against whatever's mounted at
# PGDATA and only restores the SQL files the first time PGDATA is empty.

set -e

POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-P@ssw0rd}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
PGDATA="${PGDATA:-/var/lib/postgresql/data}"
ADMIN_SQL_PATH="${ADMIN_SQL_PATH:-}"
SECURITY_SQL_PATH="${SECURITY_SQL_PATH:-}"

if [ ! -s "$PGDATA/PG_VERSION" ]; then
    # Validate SQL files are provided and accessible before doing any work
    if [ -z "$ADMIN_SQL_PATH" ]; then
        echo "ERROR: ADMIN_SQL_PATH environment variable is not set."
        echo "Mount a directory containing your SQL backup files and set ADMIN_SQL_PATH to the file path inside the container."
        exit 1
    fi
    if [ ! -f "$ADMIN_SQL_PATH" ]; then
        echo "ERROR: Admin SQL file not found at '$ADMIN_SQL_PATH'."
        echo "Ensure the file is mounted into the container at the path specified by ADMIN_SQL_PATH."
        exit 1
    fi
    if [ -z "$SECURITY_SQL_PATH" ]; then
        echo "ERROR: SECURITY_SQL_PATH environment variable is not set."
        echo "Mount a directory containing your SQL backup files and set SECURITY_SQL_PATH to the file path inside the container."
        exit 1
    fi
    if [ ! -f "$SECURITY_SQL_PATH" ]; then
        echo "ERROR: Security SQL file not found at '$SECURITY_SQL_PATH'."
        echo "Ensure the file is mounted into the container at the path specified by SECURITY_SQL_PATH."
        exit 1
    fi

    echo "Initializing PostgreSQL data directory..."
    su-exec postgres initdb \
        --username="$POSTGRES_USER" \
        --auth-local=trust \
        --auth-host=md5 \
        -D "$PGDATA"

    # Allow connections from any host (e.g. Docker bridge, host machine)
    echo "host all all 0.0.0.0/0 md5" >> "$PGDATA/pg_hba.conf"

    echo "Starting PostgreSQL for initial setup..."
    su-exec postgres postgres -D "$PGDATA" -p "$POSTGRES_PORT" -c listen_addresses='*' &
    BG_PID=$!

    retries=0
    until su-exec postgres pg_isready -U "$POSTGRES_USER" -p "$POSTGRES_PORT" -h localhost; do
        retries=$((retries + 1))
        if [ "$retries" -ge 30 ]; then
            echo "ERROR: PostgreSQL did not become ready within 60 seconds."
            exit 1
        fi
        echo "Waiting for PostgreSQL to be ready... ($retries/30)"
        sleep 2
    done

    echo "Setting user password..."
    su-exec postgres psql -p "$POSTGRES_PORT" -U "$POSTGRES_USER" \
        -c "ALTER USER \"${POSTGRES_USER}\" WITH PASSWORD '${POSTGRES_PASSWORD}';"

    echo "Creating and restoring EdFi_Admin from $ADMIN_SQL_PATH..."
    su-exec postgres psql -p "$POSTGRES_PORT" -U "$POSTGRES_USER" \
        -c "CREATE DATABASE \"EdFi_Admin\";"
    PGPASSWORD="$POSTGRES_PASSWORD" su-exec postgres psql \
        --host=localhost \
        --port="$POSTGRES_PORT" \
        --username="$POSTGRES_USER" \
        --dbname="EdFi_Admin" \
        -f "$ADMIN_SQL_PATH"

    echo "Creating and restoring EdFi_Security from $SECURITY_SQL_PATH..."
    su-exec postgres psql -p "$POSTGRES_PORT" -U "$POSTGRES_USER" \
        -c "CREATE DATABASE \"EdFi_Security\";"
    PGPASSWORD="$POSTGRES_PASSWORD" su-exec postgres psql \
        --host=localhost \
        --port="$POSTGRES_PORT" \
        --username="$POSTGRES_USER" \
        --dbname="EdFi_Security" \
        -f "$SECURITY_SQL_PATH"

    echo "Stopping setup instance..."
    su-exec postgres pg_ctl stop -D "$PGDATA" -m fast
    wait $BG_PID 2>/dev/null || true
    echo "Initial setup complete."
fi

echo "Starting PostgreSQL in foreground..."
exec su-exec postgres postgres -D "$PGDATA" -p "$POSTGRES_PORT" -c listen_addresses='*'
