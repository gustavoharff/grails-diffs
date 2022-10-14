#!/usr/bin/env bash
set -e

version=$1

find ./diffs -name "$version..*.diff" -delete
find ./diffs -name "*..$version.diff" -delete

git add .
git commit -m "Remove releases diffs"
git push origin diffs

git push --delete origin release/$version
git tag -d version/$version