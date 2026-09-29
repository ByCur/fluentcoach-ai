import pg from 'pg';
/** SQL runtime adapter. Prisma owns schema and migrations; explicit SQL keeps runtime usable in restricted/offline builds. */
export const pool=new pg.Pool({connectionString:process.env['DATABASE_URL']});
export async function sql<T extends pg.QueryResultRow=pg.QueryResultRow>(text:string,values:unknown[]=[]):Promise<T[]>{return (await pool.query<T>(text,values)).rows;}
