#!/usr/bin/env bash
set -euxo pipefail


ErrorReleaseExists=2
ErrorReleaseArgMissing=3
ErrorReleaseTagExists=4

AppName=myapp
BaseBranch=base
ReleasesFile=RELEASES

function guardMissingArg () {
    if [ "$#" -ne 1 ]; then
        echo "Release argument missing."
        exit "$ErrorReleaseArgMissing"
    fi
}

function guardExisting () {
    if grep -qFx "$newRelease" "$ReleasesFile"; then
        echo "Release $newRelease already exists!"
        exit "$ErrorReleaseExists"
    fi
    if [ $(git tag -l "version/$newRelease") ]; then
        echo "Release tag version/$newRelease already exists!"
        exit "$ErrorReleaseTagExists"
    fi
}

function prepare () {
    # This git config setting, in combination with the `.gitattributes` file, tells the scripts to not pay attention to some files that don't need to be in the diffs, like the root `.gitignore` of this repo (not the RnDiffApp project).
    git config --local diff.nodiff.command true
    git pull
    yarn install
}

function generateNewReleaseBranch () {
    # go to the base app branch
    git worktree add wt-app "$BaseBranch"
    cd wt-app

    # clear any existing stuff
    rm -rf "$AppName"

    git pull origin "$BaseBranch"
    # make a new branch
    branchName=release/"$newRelease"
    git branch -D "$branchName" || true
    git checkout -b "$branchName"

    # generate app
    asdf install grails "$newRelease"
    asdf local grails "$newRelease"

    grails create-app "$AppName" --profile=rest-api

    # commit and push branch
    git add "$AppName"
    git commit -m "Release $newRelease"
    git push origin --delete "$branchName" || git push origin "$branchName"
    git tag "version/$newRelease"
    git push --set-upstream origin "$branchName" --tags

    # go back to master
    cd ..
    rm -rf wt-app
    git worktree prune
}

function generateDiffs () {
    if [ ! -d wt-diffs ]; then
        git worktree add wt-diffs diffs
    fi

    cd wt-diffs
    git pull origin "$BaseBranch"
    cd ..

    IFS=$'\n' GLOBIGNORE='*' command eval 'releases=($(cat "$ReleasesFile"))'
    for existingRelease in "${releases[@]}"
    do
        git diff --binary origin/release/"$existingRelease"..origin/release/"$newRelease" > wt-diffs/diffs/"$existingRelease".."$newRelease".diff
        git diff --binary origin/release/"$newRelease"..origin/release/"$existingRelease" > wt-diffs/diffs/"$newRelease".."$existingRelease".diff
    done

    cd wt-diffs
    git add .
    git commit -m "Add release $newRelease diffs"
    git push
    cd ..
}

function pushMaster () {
    # commit and push
    git add .
    git commit -m "Add release $newRelease"
    git push
}

function addReleaseToList () {
    echo "$newRelease" >> RELEASES

    if command -v tac; then
        #   take each line ->dedup->    sort them              -> reverse them -> save them
        cat RELEASES | uniq | xargs yarn --silent semver | tac           > tmpfile
    else
        #   take each line ->dedup->    sort them              -> reverse them -> save them
        cat RELEASES | uniq | xargs yarn --silent semver | tail -r       > tmpfile
    fi

    mv tmpfile RELEASES
}

ReadmeHeader=README_HEADER.md
ReadmeFooter=README_FOOTER.md

function cleanUp () {
    rm -rf wt-app
    rm -rf wt-diffs
    git worktree prune
}


guardMissingArg $*
newRelease=$1

guardExisting

prepare
generateNewReleaseBranch
addReleaseToList
generateDiffs

cleanUp
pushMaster