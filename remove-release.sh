if [ $(git tag -l "$1") ]; then
    git tag --delete  $1
    git push --delete origin $1

    echo done.
else
    echo tag named "$1" was not found
fi