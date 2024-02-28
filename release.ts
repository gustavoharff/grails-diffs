import fs from "node:fs";
import child_process from "node:child_process";

const JDK = "11";
const GORM = "hibernate";
const SERVLET = "tomcat";
const TEST = "spock";

type Type = "app" | "plugin";
type Profile = "web" | "rest-api" | "web-plugin" | "rest-api-plugin";

const version: string = process.argv[2];
const profile: Profile = process.argv[3] as Profile;
const type: Type = process.argv[4] as Type;

const APP_NAME = type === "app" ? "myapp" : "myplugin";

type Command =
  | "create-restapi"
  | "create-webapp"
  | "create-plugin"
  | "create-web-plugin";

const command: Command = (() => {
  if (type === "app" && profile === "web") {
    return "create-webapp";
  }

  if (type === "app" && profile === "rest-api") {
    return "create-restapi";
  }

  if (type === "plugin" && profile === "web-plugin") {
    return "create-web-plugin";
  }

  if (type === "plugin" && profile === "rest-api-plugin") {
    return "create-plugin";
  }

  console.log("Invalid profile and type combination");
  process.exit(1);
})();

const BASE_BRANCH = "base";
const RELEASES_FILE = "RELEASES";

const RELEASE_KEY = `${version}-${profile}-${type}`;

function guardExisting() {
  const releases = fs.readFileSync(RELEASES_FILE, "utf-8");

  const lines = releases.split("\n");

  const release = lines.find((line) => line === RELEASE_KEY);

  if (release) {
    console.log("Release already exists");
    process.exit(1);
  }

  const TAG = `version/${version}-${profile}-${type}`;

  // verify if tag exists
  const tagExists = child_process.execSync(`git tag --list ${TAG}`).toString();

  if (tagExists) {
    console.log("Tag already exists");
    process.exit(1);
  }
}

function prepare() {
  // This git config setting, in combination with the `.gitattributes` file, tells the scripts to not pay attention to some files that don't need to be in the diffs, like the root `.gitignore` of this repo (not the RnDiffApp project).
  child_process.execSync("git config --local diff.nodiff.command true");
  child_process.execSync("git pull");
  child_process.execSync("yarn install");
}

function generateNewReleaseBranch() {
  // go to the base app branch
  child_process.execSync(`git worktree add wt-app ${BASE_BRANCH}`);
  process.chdir("wt-app");

  // clear any existing stuff
  child_process.execSync(`rm -rf ${APP_NAME}`);

  child_process.execSync(`git pull origin ${BASE_BRANCH}`);

  // make a new branch
  const branchName = `release/${version}-${profile}-${type}`;
  child_process.execSync(`git branch -D ${branchName} || true`);
  child_process.execSync(`git checkout -b ${branchName}`);

  // generate app
  // child_process.execSync(`sdk install grails ${version}`);
  // child_process.execSync(`sdk use grails ${version}`);

  child_process.execSync(
    `grails ${command} --servlet=${SERVLET} --jdk=${JDK} --gorm=${GORM} --test=${TEST} ${APP_NAME}`
  );

  // commit and push branch
  child_process.execSync(`git add ${APP_NAME}`);
  child_process.execSync(
    `git commit -m "Release ${version}-${profile}-${type}"`
  );
  child_process.execSync(
    `git push origin --delete ${branchName} || git push origin ${branchName}`
  );
  child_process.execSync(`git tag version/${version}-${profile}-${type}`);
  child_process.execSync(`git push --set-upstream origin ${branchName} --tags`);

  // go back to master
  process.chdir("..");
  child_process.execSync("rm -rf wt-app");
  child_process.execSync("git worktree prune");
}

function generateDiffs() {
  child_process.execSync(
    "[ ! -d wt-diffs ] && git worktree add wt-diffs diffs"
  );

  process.chdir("wt-diffs");
  child_process.execSync(`git pull origin ${BASE_BRANCH}`);
  process.chdir("..");

  const file = fs.readFileSync(RELEASES_FILE, "utf-8");

  const releases = file.split("\n");

  for (const existingRelease of releases) {
    if (!existingRelease) {
      continue;
    }

    child_process.execSync(
      `git diff --binary origin/release/${existingRelease}..origin/release/${RELEASE_KEY} > wt-diffs/diffs/${existingRelease}..${RELEASE_KEY}.diff`
    );
    child_process.execSync(
      `git diff --binary origin/release/${RELEASE_KEY}..origin/release/${existingRelease} > wt-diffs/diffs/${RELEASE_KEY}..${existingRelease}.diff`
    );

    child_process.execSync(
      "find ./wt-diffs/diffs -name '*plugin..*app.diff' -delete"
    );
    child_process.execSync(
      "find ./wt-diffs/diffs -name '*app..*plugin.diff' -delete"
    );

    process.chdir("wt-diffs");
    child_process.spawnSync("git", ["add", "."]);
    child_process.spawnSync("git", ["commit", "-m", `Add release ${RELEASE_KEY} diffs`]);
    child_process.spawnSync("git", ["push"]);
    process.chdir("..");
  }
}

function pushMaster() {
  child_process.spawnSync("git", ["add", "."]);
  child_process.spawnSync("git", ["commit", "-m", `Add release ${RELEASE_KEY} diffs`]);
  child_process.spawnSync("git", ["push"]);
}

function addReleaseToList() {
  child_process.execSync(`echo "${RELEASE_KEY}" >> ${RELEASES_FILE}`);

  let hasTac: boolean

  try {
    child_process.execSync("command -v tac");
    hasTac = true;
  } catch (e) {
    hasTac = false;
  }

  if (hasTac) {
    //   take each line ->dedup->    sort them              -> reverse them -> save them
    child_process.execSync(
      `cat ${RELEASES_FILE} | uniq | xargs yarn --silent semver | tac > tmpfile`
    );
  } else {
    //   take each line ->dedup->    sort them              -> reverse them -> save them
    child_process.execSync(
      `cat ${RELEASES_FILE} | uniq | xargs yarn --silent semver | tail -r > tmpfile`
    );
  }

  child_process.execSync(`mv tmpfile ${RELEASES_FILE}`);
}

function cleanUp() {
  child_process.execSync("rm -rf wt-app");
  child_process.execSync("rm -rf wt-diffs");
  child_process.execSync("git worktree prune");
}

guardExisting();
prepare();
generateNewReleaseBranch();
addReleaseToList();
generateDiffs();

cleanUp();
pushMaster();
