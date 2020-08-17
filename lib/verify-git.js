const execa = require('execa');
const getError = require('./get-error');

async function isDirty({env}) {
  const {stdout: wc} = await execa('git', ['status', '--porcelain'], {env});
  const files = wc.split('\n').filter((line) => line.length > 0);
  const tracked = files.filter((line) => !line.match(/^\?\?/));
  return tracked.length > 0 ? {files} : null;
}

const VALIDATORS = {
  dirtyWc: isDirty,
};

async function verifyGit(context) {
  const result = await Promise.all(
    Object.entries(VALIDATORS).map(async ([name, validator]) => {
      const details = await validator(context);
      return [name, details];
    })
  );
  return result.filter(([, details]) => details).map(([name, details]) => getError(`E${name.toUpperCase()}`, details));
}

module.exports = verifyGit;
