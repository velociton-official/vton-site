#!/usr/bin/env bash
set -e
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
