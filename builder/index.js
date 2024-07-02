const fs = require("node:fs/promises");
const mariadb = require("mariadb");

const main = async () => {
  const db = await mariadb.createConnection({
    user: "drupal",
    password: "drupal",
    database: "weathergov",
    host: "localhost",
    port: 3306,
    ssl: { rejectUnauthorized: false },
  });

  const wfos = await db.query(
    "SELECT wfo,ST_ASGEOJSON(shape) as shape FROM weathergov_geo_cwas",
  );
  await db.end();

  await fs.writeFile("./wfos.geojson", JSON.stringify(wfos));
};
main();
