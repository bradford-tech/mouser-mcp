/** @type {import('npm-check-updates').RcOptions } */
module.exports = {
  target: (name) => {
    if (name === "typescript" || name === "@types/node") return "minor";
    return "latest";
  },
};
