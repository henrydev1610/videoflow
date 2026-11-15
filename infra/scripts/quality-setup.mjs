import pg from 'pg';
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  if (
    !(
      await client.query(
        "SELECT 1 FROM pg_database WHERE datname='videoflow_regression'",
      )
    ).rowCount
  )
    await client.query('CREATE DATABASE videoflow_regression');
} finally {
  await client.end();
}
