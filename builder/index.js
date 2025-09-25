import fs from "node:fs/promises";
import { Client } from "pg";

// You've gotta have the beta.weather.gov database running locally in order for
// this to work. It's the one documented via Docker configs at:
//
// http://github.com/weather-gov/weather.gov/

const main = async () => {
  const db = new Client({
    user: "drupal",
    password: "drupal",
    database: "weathergov",
    host: "localhost",
  });
  await db.connect();

  const [
    wfoData,
    forecastZoneData,
    fireZoneData,
    marineCoastalData,
    marineOffshoreData,
    countyData,
    stateData,
  ] = await Promise.all([
    db.query(
      "SELECT wfo,ST_ASGEOJSON(shape) as shape FROM weathergov_geo_cwas",
    ),
    await db.query(
      "SELECT id,ST_ASGEOJSON(shape) AS shape FROM weathergov_geo_zones WHERE type='forecast'",
    ),
    await db.query(
      "SELECT id,ST_ASGEOJSON(shape) AS shape FROM weathergov_geo_zones WHERE type='fire'",
    ),
    await db.query(
      "SELECT id,ST_ASGEOJSON(shape) AS shape FROM weathergov_geo_zones WHERE type='marine:coastal'",
    ),
    await db.query(
      "SELECT id,ST_ASGEOJSON(shape) AS shape FROM weathergov_geo_zones WHERE type='marine:offshore'",
    ),
    await db.query(
      "SELECT countyname,st,ST_ASGEOJSON(shape) AS shape FROM weathergov_geo_counties",
    ),
    await db.query(
      "SELECT name,ST_ASGEOJSON(shape) AS shape FROM weathergov_geo_states",
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

  const wfos = wfoData.rows.map(({ wfo: id, shape }) => {
    const geojson = JSON.parse(shape);
    wrapLongitude(geojson);

    return {
      type: "Feature",
      geometry: geojson,
      properties: { id },
    };
  });

  await fs.writeFile("./docs/wfos.geojson", JSON.stringify(wfos));

  const doZones = async (dbZones, file) => {
    const zones = dbZones.rows.map(({ id, shape }) => {
      const geojson = JSON.parse(shape);
      wrapLongitude(geojson);

      return {
        type: "Feature",
        geometry: geojson,
        properties: { id: id.split("/").pop() },
      };
    });

    await fs.writeFile(file, JSON.stringify(zones));
  };

  await doZones(forecastZoneData, "./docs/forecast-zones.geojson");
  await doZones(fireZoneData, "./docs/fire-zones.geojson");
  await doZones(marineCoastalData, "./docs/marine-coastal-zones.geojson");
  await doZones(marineOffshoreData, "./docs/marine-offshore-zones.geojson");

  const counties = countyData.rows.map(({ countyname, st, shape }) => {
    const geojson = JSON.parse(shape);
    wrapLongitude(geojson);

    return {
      type: "Feature",
      geometry: geojson,
      properties: { id: `${countyname}, ${st}`, name: countyname, state: st },
    };
  });
  await fs.writeFile("./docs/counties.geojson", JSON.stringify(counties));

  const states = stateData.rows.map(({ name, shape }) => {
    const geojson = JSON.parse(shape);
    wrapLongitude(geojson);

    return {
      type: "Feature",
      geometry: geojson,
      properties: { id: name },
    };
  });
  await fs.writeFile("./docs/states.geojson", JSON.stringify(states));
};
main();
