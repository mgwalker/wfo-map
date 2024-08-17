const fs = require("node:fs/promises");
const mariadb = require("mariadb");

// You've gotta have the beta.weather.gov database running locally in order for
// this to work. It's the one documented via Docker configs at:
//
// http://github.com/weather-gov/weather.gov/

const main = async () => {
  const db = await mariadb.createConnection({
    user: "drupal",
    password: "drupal",
    database: "weathergov",
    host: "localhost",
    port: 3306,
    ssl: { rejectUnauthorized: false },
  });

  const [wfoData, forecastZoneData, fireZoneData] = await Promise.all([
    db.query(
      "SELECT wfo,ST_ASGEOJSON(shape) as shape FROM weathergov_geo_cwas",
    ),
    await db.query(
      "SELECT id,ST_ASGEOJSON(shape) AS shape FROM weathergov_geo_zones WHERE id LIKE '%/zones/forecast/%'",
    ),
    await db.query(
      "SELECT id,ST_ASGEOJSON(shape) AS shape FROM weathergov_geo_zones WHERE id LIKE '%/zones/fire/%'",
    ),
  ]);

  await db.end();

  const wrapLongitude = (shape) => {
    if (
      Array.isArray(shape) &&
      shape.length === 2 &&
      !Number.isNaN(+shape[0]) &&
      !Number.isNaN(+shape[1])
    ) {
      if (shape[0] > 0) {
        shape[0] = shape[0] - 360;
      }
    } else if (Array.isArray(shape)) {
      shape.forEach(wrapLongitude);
    } else if (shape.coordinates) {
      wrapLongitude(shape.coordinates);
    }
  };

  const wfos = wfoData.map(({ wfo: id, shape }) => {
    wrapLongitude(shape);

    return {
      type: "Feature",
      geometry: shape,
      properties: { id },
    };
  });

  await fs.writeFile("./docs/wfos.geojson", JSON.stringify(wfos));

  const forecastZones = forecastZoneData.map(({ id, shape }) => {
    wrapLongitude(shape);
    return {
      type: "Feature",
      geometry: shape,
      properties: { id: id.split("/").pop() },
    };
  });

  await fs.writeFile(
    "./docs/forecast-zones.geojson",
    JSON.stringify(forecastZones),
  );

  const fireZones = fireZoneData.map(({ id, shape }) => {
    wrapLongitude(shape);
    return {
      type: "Feature",
      geometry: shape,
      properties: { id: id.split("/").pop() },
    };
  });

  await fs.writeFile("./docs/fire-zones.geojson", JSON.stringify(fireZones));
};
main();
