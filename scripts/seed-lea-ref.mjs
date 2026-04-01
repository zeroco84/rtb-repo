/**
 * scripts/seed-lea-ref.mjs
 *
 * Seeds ALL Irish LEA reference data into rent_register_lea_ref.
 * All 166 LEA IDs confirmed directly from RTB portal dropdowns on 2026-03-31.
 * Source: rtb.ie/rtb-rent-register/ — all 31 local authorities.
 *
 * Usage:
 *   node scripts/seed-lea-ref.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
try {
  const { default: dotenv } = await import('dotenv');
  dotenv.config({ path: join(__dirname, '..', '.env.local') });
} catch { /* not needed on Render */ }

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// All 166 LEA IDs confirmed from RTB portal on 2026-03-31
const ALL_LEAS = [
  // ── CARLOW (1) — 3 LEAs
  { local_authority_id: 1,  local_authority_name: 'CARLOW COUNTY COUNCIL',                  osi_lea_id: 1310400,  lea_name: 'Carlow',                        is_dublin: false },
  { local_authority_id: 1,  local_authority_name: 'CARLOW COUNTY COUNCIL',                  osi_lea_id: 1310402,  lea_name: 'Muinebeag',                     is_dublin: false },
  { local_authority_id: 1,  local_authority_name: 'CARLOW COUNTY COUNCIL',                  osi_lea_id: 1310401,  lea_name: 'Tullow',                        is_dublin: false },
  // ── CAVAN (2) — 3 LEAs
  { local_authority_id: 2,  local_authority_name: 'CAVAN COUNTY COUNCIL',                   osi_lea_id: 1320401,  lea_name: 'Bailieborough - Cootehill',     is_dublin: false },
  { local_authority_id: 2,  local_authority_name: 'CAVAN COUNTY COUNCIL',                   osi_lea_id: 1320402,  lea_name: 'Ballyjamesduff',                is_dublin: false },
  { local_authority_id: 2,  local_authority_name: 'CAVAN COUNTY COUNCIL',                   osi_lea_id: 1320400,  lea_name: 'Cavan - Belturbet',             is_dublin: false },
  // ── CLARE (3) — 5 LEAs
  { local_authority_id: 3,  local_authority_name: 'CLARE COUNTY COUNCIL',                   osi_lea_id: 1330403,  lea_name: 'Ennis',                         is_dublin: false },
  { local_authority_id: 3,  local_authority_name: 'CLARE COUNTY COUNCIL',                   osi_lea_id: 1330400,  lea_name: 'Ennistimon',                    is_dublin: false },
  { local_authority_id: 3,  local_authority_name: 'CLARE COUNTY COUNCIL',                   osi_lea_id: 1330401,  lea_name: 'Killaloe',                      is_dublin: false },
  { local_authority_id: 3,  local_authority_name: 'CLARE COUNTY COUNCIL',                   osi_lea_id: 1330404,  lea_name: 'Kilrush',                       is_dublin: false },
  { local_authority_id: 3,  local_authority_name: 'CLARE COUNTY COUNCIL',                   osi_lea_id: 1330402,  lea_name: 'Shannon',                       is_dublin: false },
  // ── CORK COUNTY (4) — 10 LEAs
  { local_authority_id: 4,  local_authority_name: 'CORK COUNTY COUNCIL',                    osi_lea_id: 1340405,  lea_name: 'Bandon - Kinsale',              is_dublin: false },
  { local_authority_id: 4,  local_authority_name: 'CORK COUNTY COUNCIL',                    osi_lea_id: 1340406,  lea_name: 'Bantry - West Cork',            is_dublin: false },
  { local_authority_id: 4,  local_authority_name: 'CORK COUNTY COUNCIL',                    osi_lea_id: 1340403,  lea_name: 'Carrigaline',                   is_dublin: false },
  { local_authority_id: 4,  local_authority_name: 'CORK COUNTY COUNCIL',                    osi_lea_id: 1340404,  lea_name: 'Cobh',                          is_dublin: false },
  { local_authority_id: 4,  local_authority_name: 'CORK COUNTY COUNCIL',                    osi_lea_id: 1340401,  lea_name: 'Fermoy',                        is_dublin: false },
  { local_authority_id: 4,  local_authority_name: 'CORK COUNTY COUNCIL',                    osi_lea_id: 1340400,  lea_name: 'Kanturk',                       is_dublin: false },
  { local_authority_id: 4,  local_authority_name: 'CORK COUNTY COUNCIL',                    osi_lea_id: 1340408,  lea_name: 'Macroom',                       is_dublin: false },
  { local_authority_id: 4,  local_authority_name: 'CORK COUNTY COUNCIL',                    osi_lea_id: 1340409,  lea_name: 'Mallow',                        is_dublin: false },
  { local_authority_id: 4,  local_authority_name: 'CORK COUNTY COUNCIL',                    osi_lea_id: 1340402,  lea_name: 'Midleton',                      is_dublin: false },
  { local_authority_id: 4,  local_authority_name: 'CORK COUNTY COUNCIL',                    osi_lea_id: 1340407,  lea_name: 'Skibbereen - West Cork',        is_dublin: false },
  // ── DONEGAL (5) — 7 LEAs
  { local_authority_id: 5,  local_authority_name: 'DONEGAL COUNTY COUNCIL',                 osi_lea_id: 1350403,  lea_name: 'Buncrana',                      is_dublin: false },
  { local_authority_id: 5,  local_authority_name: 'DONEGAL COUNTY COUNCIL',                 osi_lea_id: 1350402,  lea_name: 'Carndonagh',                    is_dublin: false },
  { local_authority_id: 5,  local_authority_name: 'DONEGAL COUNTY COUNCIL',                 osi_lea_id: 1350404,  lea_name: 'Donegal',                       is_dublin: false },
  { local_authority_id: 5,  local_authority_name: 'DONEGAL COUNTY COUNCIL',                 osi_lea_id: 1350400,  lea_name: 'Glenties',                      is_dublin: false },
  { local_authority_id: 5,  local_authority_name: 'DONEGAL COUNTY COUNCIL',                 osi_lea_id: 1350405,  lea_name: 'Letterkenny',                   is_dublin: false },
  { local_authority_id: 5,  local_authority_name: 'DONEGAL COUNTY COUNCIL',                 osi_lea_id: 1350406,  lea_name: 'Lifford - Stranorlar',          is_dublin: false },
  { local_authority_id: 5,  local_authority_name: 'DONEGAL COUNTY COUNCIL',                 osi_lea_id: 1350401,  lea_name: 'Milford',                       is_dublin: false },
  // ── GALWAY COUNTY (6) — 7 LEAs
  { local_authority_id: 6,  local_authority_name: 'GALWAY COUNTY COUNCIL',                  osi_lea_id: 1360404,  lea_name: 'Athenry - Oranmore',            is_dublin: false },
  { local_authority_id: 6,  local_authority_name: 'GALWAY COUNTY COUNCIL',                  osi_lea_id: 1360402,  lea_name: 'Ballinasloe',                   is_dublin: false },
  { local_authority_id: 6,  local_authority_name: 'GALWAY COUNTY COUNCIL',                  osi_lea_id: 1360400,  lea_name: 'Conamara North',                is_dublin: false },
  { local_authority_id: 6,  local_authority_name: 'GALWAY COUNTY COUNCIL',                  osi_lea_id: 1360406,  lea_name: 'Conamara South',                is_dublin: false },
  { local_authority_id: 6,  local_authority_name: 'GALWAY COUNTY COUNCIL',                  osi_lea_id: 1360405,  lea_name: 'Gort - Kinvara',                is_dublin: false },
  { local_authority_id: 6,  local_authority_name: 'GALWAY COUNTY COUNCIL',                  osi_lea_id: 1360403,  lea_name: 'Loughrea',                      is_dublin: false },
  { local_authority_id: 6,  local_authority_name: 'GALWAY COUNTY COUNCIL',                  osi_lea_id: 1360401,  lea_name: 'Tuam',                          is_dublin: false },
  // ── KERRY (7) — 6 LEAs
  { local_authority_id: 7,  local_authority_name: 'KERRY COUNTY COUNCIL',                   osi_lea_id: 1370401,  lea_name: 'Castleisland',                  is_dublin: false },
  { local_authority_id: 7,  local_authority_name: 'KERRY COUNTY COUNCIL',                   osi_lea_id: 1370404,  lea_name: 'Corca Dhuibhne',                is_dublin: false },
  { local_authority_id: 7,  local_authority_name: 'KERRY COUNTY COUNCIL',                   osi_lea_id: 1370403,  lea_name: 'Kenmare',                       is_dublin: false },
  { local_authority_id: 7,  local_authority_name: 'KERRY COUNTY COUNCIL',                   osi_lea_id: 1370402,  lea_name: 'Killarney',                     is_dublin: false },
  { local_authority_id: 7,  local_authority_name: 'KERRY COUNTY COUNCIL',                   osi_lea_id: 1370400,  lea_name: 'Listowel',                      is_dublin: false },
  { local_authority_id: 7,  local_authority_name: 'KERRY COUNTY COUNCIL',                   osi_lea_id: 1370405,  lea_name: 'Tralee',                        is_dublin: false },
  // ── KILDARE (8) — 8 LEAs
  { local_authority_id: 8,  local_authority_name: 'KILDARE COUNTY COUNCIL',                 osi_lea_id: 1380403,  lea_name: 'Athy',                          is_dublin: false },
  { local_authority_id: 8,  local_authority_name: 'KILDARE COUNTY COUNCIL',                 osi_lea_id: 1380401,  lea_name: 'Celbridge',                     is_dublin: false },
  { local_authority_id: 8,  local_authority_name: 'KILDARE COUNTY COUNCIL',                 osi_lea_id: 1380405,  lea_name: 'Clane',                         is_dublin: false },
  { local_authority_id: 8,  local_authority_name: 'KILDARE COUNTY COUNCIL',                 osi_lea_id: 1380404,  lea_name: 'Kildare',                       is_dublin: false },
  { local_authority_id: 8,  local_authority_name: 'KILDARE COUNTY COUNCIL',                 osi_lea_id: 1380406,  lea_name: 'Leixlip',                       is_dublin: false },
  { local_authority_id: 8,  local_authority_name: 'KILDARE COUNTY COUNCIL',                 osi_lea_id: 1380400,  lea_name: 'Maynooth',                      is_dublin: false },
  { local_authority_id: 8,  local_authority_name: 'KILDARE COUNTY COUNCIL',                 osi_lea_id: 1380402,  lea_name: 'Naas',                          is_dublin: false },
  { local_authority_id: 8,  local_authority_name: 'KILDARE COUNTY COUNCIL',                 osi_lea_id: 1380407,  lea_name: 'Newbridge',                     is_dublin: false },
  // ── KILKENNY (9) — 4 LEAs
  { local_authority_id: 9,  local_authority_name: 'KILKENNY COUNTY COUNCIL',                osi_lea_id: 1390403,  lea_name: 'Callan - Thomastown',           is_dublin: false },
  { local_authority_id: 9,  local_authority_name: 'KILKENNY COUNTY COUNCIL',                osi_lea_id: 1390400,  lea_name: 'Castlecomer',                   is_dublin: false },
  { local_authority_id: 9,  local_authority_name: 'KILKENNY COUNTY COUNCIL',                osi_lea_id: 1390401,  lea_name: 'Kilkenny',                      is_dublin: false },
  { local_authority_id: 9,  local_authority_name: 'KILKENNY COUNTY COUNCIL',                osi_lea_id: 1390402,  lea_name: 'Piltown',                       is_dublin: false },
  // ── LAOIS (10) — 3 LEAs
  { local_authority_id: 10, local_authority_name: 'LAOIS COUNTY COUNCIL',                   osi_lea_id: 13100400, lea_name: 'Borris-In-Ossory - Mountmellick', is_dublin: false },
  { local_authority_id: 10, local_authority_name: 'LAOIS COUNTY COUNCIL',                   osi_lea_id: 13100402, lea_name: 'Graiguecullen - Portarlington', is_dublin: false },
  { local_authority_id: 10, local_authority_name: 'LAOIS COUNTY COUNCIL',                   osi_lea_id: 13100401, lea_name: 'Portlaoise',                    is_dublin: false },
  // ── LEITRIM (11) — 3 LEAs
  { local_authority_id: 11, local_authority_name: 'LEITRIM COUNTY COUNCIL',                 osi_lea_id: 13110401, lea_name: 'Ballinamore',                   is_dublin: false },
  { local_authority_id: 11, local_authority_name: 'LEITRIM COUNTY COUNCIL',                 osi_lea_id: 13110402, lea_name: 'Carrick-On-Shannon',             is_dublin: false },
  { local_authority_id: 11, local_authority_name: 'LEITRIM COUNTY COUNCIL',                 osi_lea_id: 13110400, lea_name: 'Manorhamilton',                  is_dublin: false },
  // ── LIMERICK (12) — 6 LEAs
  { local_authority_id: 12, local_authority_name: 'LIMERICK CITY AND COUNTY COUNCIL',       osi_lea_id: 13120401, lea_name: 'Adare - Rathkeale',             is_dublin: false },
  { local_authority_id: 12, local_authority_name: 'LIMERICK CITY AND COUNTY COUNCIL',       osi_lea_id: 13120402, lea_name: 'Cappamore - Kilmallock',        is_dublin: false },
  { local_authority_id: 12, local_authority_name: 'LIMERICK CITY AND COUNTY COUNCIL',       osi_lea_id: 13120422, lea_name: 'Limerick City East',            is_dublin: false },
  { local_authority_id: 12, local_authority_name: 'LIMERICK CITY AND COUNTY COUNCIL',       osi_lea_id: 13120421, lea_name: 'Limerick City North',           is_dublin: false },
  { local_authority_id: 12, local_authority_name: 'LIMERICK CITY AND COUNTY COUNCIL',       osi_lea_id: 13120420, lea_name: 'Limerick City West',            is_dublin: false },
  { local_authority_id: 12, local_authority_name: 'LIMERICK CITY AND COUNTY COUNCIL',       osi_lea_id: 13120400, lea_name: 'Newcastle West',                is_dublin: false },
  // ── LONGFORD (13) — 3 LEAs
  { local_authority_id: 13, local_authority_name: 'LONGFORD COUNTY COUNCIL',                osi_lea_id: 13130401, lea_name: 'Ballymahon',                    is_dublin: false },
  { local_authority_id: 13, local_authority_name: 'LONGFORD COUNTY COUNCIL',                osi_lea_id: 13130400, lea_name: 'Granard',                       is_dublin: false },
  { local_authority_id: 13, local_authority_name: 'LONGFORD COUNTY COUNCIL',                osi_lea_id: 13130402, lea_name: 'Longford',                      is_dublin: false },
  // ── LOUTH (14) — 5 LEAs
  { local_authority_id: 14, local_authority_name: 'LOUTH COUNTY COUNCIL',                   osi_lea_id: 13140402, lea_name: 'Ardee',                         is_dublin: false },
  { local_authority_id: 14, local_authority_name: 'LOUTH COUNTY COUNCIL',                   osi_lea_id: 13140403, lea_name: 'Drogheda Rural',                 is_dublin: false },
  { local_authority_id: 14, local_authority_name: 'LOUTH COUNTY COUNCIL',                   osi_lea_id: 13140404, lea_name: 'Drogheda Urban',                 is_dublin: false },
  { local_authority_id: 14, local_authority_name: 'LOUTH COUNTY COUNCIL',                   osi_lea_id: 13140400, lea_name: 'Dundalk - Carlingford',          is_dublin: false },
  { local_authority_id: 14, local_authority_name: 'LOUTH COUNTY COUNCIL',                   osi_lea_id: 13140401, lea_name: 'Dundalk South',                  is_dublin: false },
  // ── MAYO (15) — 6 LEAs
  { local_authority_id: 15, local_authority_name: 'MAYO COUNTY COUNCIL',                    osi_lea_id: 13150400, lea_name: 'Ballina',                        is_dublin: false },
  { local_authority_id: 15, local_authority_name: 'MAYO COUNTY COUNCIL',                    osi_lea_id: 13150403, lea_name: 'Belmullet',                      is_dublin: false },
  { local_authority_id: 15, local_authority_name: 'MAYO COUNTY COUNCIL',                    osi_lea_id: 13150402, lea_name: 'Castlebar',                      is_dublin: false },
  { local_authority_id: 15, local_authority_name: 'MAYO COUNTY COUNCIL',                    osi_lea_id: 13150401, lea_name: 'Claremorris',                    is_dublin: false },
  { local_authority_id: 15, local_authority_name: 'MAYO COUNTY COUNCIL',                    osi_lea_id: 13150405, lea_name: 'Swinford',                       is_dublin: false },
  { local_authority_id: 15, local_authority_name: 'MAYO COUNTY COUNCIL',                    osi_lea_id: 13150404, lea_name: 'Westport',                       is_dublin: false },
  // ── MEATH (16) — 6 LEAs
  { local_authority_id: 16, local_authority_name: 'MEATH COUNTY COUNCIL',                   osi_lea_id: 13160402, lea_name: 'Ashbourne',                      is_dublin: false },
  { local_authority_id: 16, local_authority_name: 'MEATH COUNTY COUNCIL',                   osi_lea_id: 13160400, lea_name: 'Kells',                          is_dublin: false },
  { local_authority_id: 16, local_authority_name: 'MEATH COUNTY COUNCIL',                   osi_lea_id: 13160401, lea_name: 'Laytown - Bettystown',           is_dublin: false },
  { local_authority_id: 16, local_authority_name: 'MEATH COUNTY COUNCIL',                   osi_lea_id: 13160405, lea_name: 'Navan',                          is_dublin: false },
  { local_authority_id: 16, local_authority_name: 'MEATH COUNTY COUNCIL',                   osi_lea_id: 13160403, lea_name: 'Ratoath',                        is_dublin: false },
  { local_authority_id: 16, local_authority_name: 'MEATH COUNTY COUNCIL',                   osi_lea_id: 13160404, lea_name: 'Trim',                           is_dublin: false },
  // ── MONAGHAN (17) — 3 LEAs
  { local_authority_id: 17, local_authority_name: 'MONAGHAN COUNTY COUNCIL',                osi_lea_id: 13170402, lea_name: 'Ballybay - Clones',              is_dublin: false },
  { local_authority_id: 17, local_authority_name: 'MONAGHAN COUNTY COUNCIL',                osi_lea_id: 13170401, lea_name: 'Carrickmacross - Castleblayney', is_dublin: false },
  { local_authority_id: 17, local_authority_name: 'MONAGHAN COUNTY COUNCIL',                osi_lea_id: 13170400, lea_name: 'Monaghan',                       is_dublin: false },
  // ── OFFALY (18) — 3 LEAs
  { local_authority_id: 18, local_authority_name: 'OFFALY COUNTY COUNCIL',                  osi_lea_id: 13180400, lea_name: 'Birr',                           is_dublin: false },
  { local_authority_id: 18, local_authority_name: 'OFFALY COUNTY COUNCIL',                  osi_lea_id: 13180402, lea_name: 'Edenderry',                      is_dublin: false },
  { local_authority_id: 18, local_authority_name: 'OFFALY COUNTY COUNCIL',                  osi_lea_id: 13180401, lea_name: 'Tullamore',                      is_dublin: false },
  // ── ROSCOMMON (19) — 3 LEAs
  { local_authority_id: 19, local_authority_name: 'ROSCOMMON COUNTY COUNCIL',               osi_lea_id: 13190402, lea_name: 'Athlone',                        is_dublin: false },
  { local_authority_id: 19, local_authority_name: 'ROSCOMMON COUNTY COUNCIL',               osi_lea_id: 13190400, lea_name: 'Boyle',                          is_dublin: false },
  { local_authority_id: 19, local_authority_name: 'ROSCOMMON COUNTY COUNCIL',               osi_lea_id: 13190401, lea_name: 'Roscommon',                      is_dublin: false },
  // ── SLIGO (20) — 3 LEAs
  { local_authority_id: 20, local_authority_name: 'SLIGO COUNTY COUNCIL',                   osi_lea_id: 13200400, lea_name: 'Ballymote - Tobercurry',         is_dublin: false },
  { local_authority_id: 20, local_authority_name: 'SLIGO COUNTY COUNCIL',                   osi_lea_id: 13200401, lea_name: 'Sligo - Drumcliff',              is_dublin: false },
  { local_authority_id: 20, local_authority_name: 'SLIGO COUNTY COUNCIL',                   osi_lea_id: 13200402, lea_name: 'Sligo - Strandhill',             is_dublin: false },
  // ── TIPPERARY (21) — 8 LEAs
  { local_authority_id: 21, local_authority_name: 'TIPPERARY COUNTY COUNCIL',               osi_lea_id: 13210407, lea_name: 'Cahir',                          is_dublin: false },
  { local_authority_id: 21, local_authority_name: 'TIPPERARY COUNTY COUNCIL',               osi_lea_id: 13210402, lea_name: 'Carrick-On-Suir',               is_dublin: false },
  { local_authority_id: 21, local_authority_name: 'TIPPERARY COUNTY COUNCIL',               osi_lea_id: 13210404, lea_name: 'Cashel - Tipperary',             is_dublin: false },
  { local_authority_id: 21, local_authority_name: 'TIPPERARY COUNTY COUNCIL',               osi_lea_id: 13210403, lea_name: 'Clonmel',                        is_dublin: false },
  { local_authority_id: 21, local_authority_name: 'TIPPERARY COUNTY COUNCIL',               osi_lea_id: 13210400, lea_name: 'Nenagh',                         is_dublin: false },
  { local_authority_id: 21, local_authority_name: 'TIPPERARY COUNTY COUNCIL',               osi_lea_id: 13210405, lea_name: 'Newport',                        is_dublin: false },
  { local_authority_id: 21, local_authority_name: 'TIPPERARY COUNTY COUNCIL',               osi_lea_id: 13210401, lea_name: 'Roscrea - Templemore',           is_dublin: false },
  { local_authority_id: 21, local_authority_name: 'TIPPERARY COUNTY COUNCIL',               osi_lea_id: 13210406, lea_name: 'Thurles',                        is_dublin: false },
  // ── WATERFORD (22) — 6 LEAs
  { local_authority_id: 22, local_authority_name: 'WATERFORD CITY AND COUNTY COUNCIL',      osi_lea_id: 13220400, lea_name: 'Dungarvan',                      is_dublin: false },
  { local_authority_id: 22, local_authority_name: 'WATERFORD CITY AND COUNTY COUNCIL',      osi_lea_id: 13220402, lea_name: 'Lismore',                        is_dublin: false },
  { local_authority_id: 22, local_authority_name: 'WATERFORD CITY AND COUNTY COUNCIL',      osi_lea_id: 13220401, lea_name: 'Portlaw - Kilmacthomas',         is_dublin: false },
  { local_authority_id: 22, local_authority_name: 'WATERFORD CITY AND COUNTY COUNCIL',      osi_lea_id: 13220420, lea_name: 'Tramore - Waterford City West',  is_dublin: false },
  { local_authority_id: 22, local_authority_name: 'WATERFORD CITY AND COUNTY COUNCIL',      osi_lea_id: 13220422, lea_name: 'Waterford City East',            is_dublin: false },
  { local_authority_id: 22, local_authority_name: 'WATERFORD CITY AND COUNTY COUNCIL',      osi_lea_id: 13220421, lea_name: 'Waterford City South',           is_dublin: false },
  // ── WESTMEATH (23) — 4 LEAs
  { local_authority_id: 23, local_authority_name: 'WESTMEATH COUNTY COUNCIL',               osi_lea_id: 13230400, lea_name: 'Athlone',                        is_dublin: false },
  { local_authority_id: 23, local_authority_name: 'WESTMEATH COUNTY COUNCIL',               osi_lea_id: 13230402, lea_name: 'Kinnegad',                       is_dublin: false },
  { local_authority_id: 23, local_authority_name: 'WESTMEATH COUNTY COUNCIL',               osi_lea_id: 13230401, lea_name: 'Moate',                          is_dublin: false },
  { local_authority_id: 23, local_authority_name: 'WESTMEATH COUNTY COUNCIL',               osi_lea_id: 13230403, lea_name: 'Mullingar',                      is_dublin: false },
  // ── WEXFORD (24) — 6 LEAs
  { local_authority_id: 24, local_authority_name: 'WEXFORD COUNTY COUNCIL',                 osi_lea_id: 13240405, lea_name: 'Enniscorthy',                    is_dublin: false },
  { local_authority_id: 24, local_authority_name: 'WEXFORD COUNTY COUNCIL',                 osi_lea_id: 13240400, lea_name: 'Gorey',                          is_dublin: false },
  { local_authority_id: 24, local_authority_name: 'WEXFORD COUNTY COUNCIL',                 osi_lea_id: 13240401, lea_name: 'Kilmuckridge',                   is_dublin: false },
  { local_authority_id: 24, local_authority_name: 'WEXFORD COUNTY COUNCIL',                 osi_lea_id: 13240402, lea_name: 'New Ross',                       is_dublin: false },
  { local_authority_id: 24, local_authority_name: 'WEXFORD COUNTY COUNCIL',                 osi_lea_id: 13240403, lea_name: 'Rosslare',                       is_dublin: false },
  { local_authority_id: 24, local_authority_name: 'WEXFORD COUNTY COUNCIL',                 osi_lea_id: 13240404, lea_name: 'Wexford',                        is_dublin: false },
  // ── WICKLOW (25) — 6 LEAs
  { local_authority_id: 25, local_authority_name: 'WICKLOW COUNTY COUNCIL',                 osi_lea_id: 13250404, lea_name: 'Arklow',                         is_dublin: false },
  { local_authority_id: 25, local_authority_name: 'WICKLOW COUNTY COUNCIL',                 osi_lea_id: 13250400, lea_name: 'Baltinglass',                    is_dublin: false },
  { local_authority_id: 25, local_authority_name: 'WICKLOW COUNTY COUNCIL',                 osi_lea_id: 13250405, lea_name: 'Bray East',                      is_dublin: false },
  { local_authority_id: 25, local_authority_name: 'WICKLOW COUNTY COUNCIL',                 osi_lea_id: 13250401, lea_name: 'Bray West',                      is_dublin: false },
  { local_authority_id: 25, local_authority_name: 'WICKLOW COUNTY COUNCIL',                 osi_lea_id: 13250402, lea_name: 'Greystones',                     is_dublin: false },
  { local_authority_id: 25, local_authority_name: 'WICKLOW COUNTY COUNCIL',                 osi_lea_id: 13250403, lea_name: 'Wicklow',                        is_dublin: false },
  // ── SOUTH DUBLIN (26) — 7 LEAs
  { local_authority_id: 26, local_authority_name: 'SOUTH DUBLIN COUNTY COUNCIL',            osi_lea_id: 13260416, lea_name: 'Clondalkin',                     is_dublin: true },
  { local_authority_id: 26, local_authority_name: 'SOUTH DUBLIN COUNTY COUNCIL',            osi_lea_id: 13260414, lea_name: 'Firhouse - Bohernabreena',       is_dublin: true },
  { local_authority_id: 26, local_authority_name: 'SOUTH DUBLIN COUNTY COUNCIL',            osi_lea_id: 13260411, lea_name: 'Lucan',                          is_dublin: true },
  { local_authority_id: 26, local_authority_name: 'SOUTH DUBLIN COUNTY COUNCIL',            osi_lea_id: 13260419, lea_name: 'Palmerstown - Fonthill',         is_dublin: true },
  { local_authority_id: 26, local_authority_name: 'SOUTH DUBLIN COUNTY COUNCIL',            osi_lea_id: 13260413, lea_name: 'Rathfarnham - Templeogue',       is_dublin: true },
  { local_authority_id: 26, local_authority_name: 'SOUTH DUBLIN COUNTY COUNCIL',            osi_lea_id: 13260412, lea_name: 'Tallaght Central',               is_dublin: true },
  { local_authority_id: 26, local_authority_name: 'SOUTH DUBLIN COUNTY COUNCIL',            osi_lea_id: 13260415, lea_name: 'Tallaght South',                 is_dublin: true },
  // ── FINGAL (27) — 7 LEAs
  { local_authority_id: 27, local_authority_name: 'FINGAL COUNTY COUNCIL',                  osi_lea_id: 13260417, lea_name: 'Balbriggan',                     is_dublin: true },
  { local_authority_id: 27, local_authority_name: 'FINGAL COUNTY COUNCIL',                  osi_lea_id: 13260402, lea_name: 'Blanchardstown - Mulhuddart',    is_dublin: true },
  { local_authority_id: 27, local_authority_name: 'FINGAL COUNTY COUNCIL',                  osi_lea_id: 13260403, lea_name: 'Castleknock',                    is_dublin: true },
  { local_authority_id: 27, local_authority_name: 'FINGAL COUNTY COUNCIL',                  osi_lea_id: 13260404, lea_name: 'Howth - Malahide',               is_dublin: true },
  { local_authority_id: 27, local_authority_name: 'FINGAL COUNTY COUNCIL',                  osi_lea_id: 13260418, lea_name: 'Ongar',                          is_dublin: true },
  { local_authority_id: 27, local_authority_name: 'FINGAL COUNTY COUNCIL',                  osi_lea_id: 13260400, lea_name: 'Rush - Lusk',                    is_dublin: true },
  { local_authority_id: 27, local_authority_name: 'FINGAL COUNTY COUNCIL',                  osi_lea_id: 13260401, lea_name: 'Swords',                         is_dublin: true },
  // ── DÚN LAOGHAIRE-RATHDOWN (28) — 6 LEAs
  { local_authority_id: 28, local_authority_name: 'DUN LAOGHAIRE-RATHDOWN COUNTY COUNCIL',  osi_lea_id: 13260410, lea_name: 'Blackrock',                      is_dublin: true },
  { local_authority_id: 28, local_authority_name: 'DUN LAOGHAIRE-RATHDOWN COUNTY COUNCIL',  osi_lea_id: 13260409, lea_name: 'Dún Laoghaire',                  is_dublin: true },
  { local_authority_id: 28, local_authority_name: 'DUN LAOGHAIRE-RATHDOWN COUNTY COUNCIL',  osi_lea_id: 13260406, lea_name: 'Dundrum',                        is_dublin: true },
  { local_authority_id: 28, local_authority_name: 'DUN LAOGHAIRE-RATHDOWN COUNTY COUNCIL',  osi_lea_id: 13260407, lea_name: 'Glencullen - Sandyford',         is_dublin: true },
  { local_authority_id: 28, local_authority_name: 'DUN LAOGHAIRE-RATHDOWN COUNTY COUNCIL',  osi_lea_id: 13260408, lea_name: 'Killiney - Shankill',            is_dublin: true },
  { local_authority_id: 28, local_authority_name: 'DUN LAOGHAIRE-RATHDOWN COUNTY COUNCIL',  osi_lea_id: 13260405, lea_name: 'Stillorgan',                     is_dublin: true },
  // ── DUBLIN CITY (29) — 11 LEAs
  { local_authority_id: 29, local_authority_name: 'DUBLIN CITY COUNTY COUNCIL',             osi_lea_id: 13260429, lea_name: 'Artane - Whitehall',             is_dublin: true },
  { local_authority_id: 29, local_authority_name: 'DUBLIN CITY COUNTY COUNCIL',             osi_lea_id: 13260422, lea_name: 'Ballyfermot - Drimnagh',         is_dublin: true },
  { local_authority_id: 29, local_authority_name: 'DUBLIN CITY COUNTY COUNCIL',             osi_lea_id: 13260420, lea_name: 'Ballymun - Finglas',             is_dublin: true },
  { local_authority_id: 29, local_authority_name: 'DUBLIN CITY COUNTY COUNCIL',             osi_lea_id: 13260421, lea_name: 'Cabra - Glasnevin',              is_dublin: true },
  { local_authority_id: 29, local_authority_name: 'DUBLIN CITY COUNTY COUNCIL',             osi_lea_id: 13260427, lea_name: 'Clontarf',                       is_dublin: true },
  { local_authority_id: 29, local_authority_name: 'DUBLIN CITY COUNTY COUNCIL',             osi_lea_id: 13260428, lea_name: 'Donaghmede',                     is_dublin: true },
  { local_authority_id: 29, local_authority_name: 'DUBLIN CITY COUNTY COUNCIL',             osi_lea_id: 13260423, lea_name: 'Kimmage - Rathmines',            is_dublin: true },
  { local_authority_id: 29, local_authority_name: 'DUBLIN CITY COUNTY COUNCIL',             osi_lea_id: 13260426, lea_name: 'North Inner City',               is_dublin: true },
  { local_authority_id: 29, local_authority_name: 'DUBLIN CITY COUNTY COUNCIL',             osi_lea_id: 13260424, lea_name: 'Pembroke',                       is_dublin: true },
  { local_authority_id: 29, local_authority_name: 'DUBLIN CITY COUNTY COUNCIL',             osi_lea_id: 13260425, lea_name: 'South East Inner City',          is_dublin: true },
  { local_authority_id: 29, local_authority_name: 'DUBLIN CITY COUNTY COUNCIL',             osi_lea_id: 13260430, lea_name: 'South West Inner City',          is_dublin: true },
  // ── CORK CITY (30) — 5 LEAs
  { local_authority_id: 30, local_authority_name: 'CORK CITY COUNTY COUNCIL',               osi_lea_id: 1340411,  lea_name: 'Cork City North East',           is_dublin: false },
  { local_authority_id: 30, local_authority_name: 'CORK CITY COUNTY COUNCIL',               osi_lea_id: 1340410,  lea_name: 'Cork City North West',           is_dublin: false },
  { local_authority_id: 30, local_authority_name: 'CORK CITY COUNTY COUNCIL',               osi_lea_id: 1340413,  lea_name: 'Cork City South Central',        is_dublin: false },
  { local_authority_id: 30, local_authority_name: 'CORK CITY COUNTY COUNCIL',               osi_lea_id: 1340412,  lea_name: 'Cork City South East',           is_dublin: false },
  { local_authority_id: 30, local_authority_name: 'CORK CITY COUNTY COUNCIL',               osi_lea_id: 1340414,  lea_name: 'Cork City South West',           is_dublin: false },
  // ── GALWAY CITY (31) — 3 LEAs
  { local_authority_id: 31, local_authority_name: 'GALWAY CITY COUNTY COUNCIL',             osi_lea_id: 1360421,  lea_name: 'Galway City Central',            is_dublin: false },
  { local_authority_id: 31, local_authority_name: 'GALWAY CITY COUNTY COUNCIL',             osi_lea_id: 1360422,  lea_name: 'Galway City East',               is_dublin: false },
  { local_authority_id: 31, local_authority_name: 'GALWAY CITY COUNTY COUNCIL',             osi_lea_id: 1360420,  lea_name: 'Galway City West',               is_dublin: false },
];

async function main() {
    console.log('=== RTB National LEA Seed Script ===');
    console.log(`Seeding ${ALL_LEAS.length} LEAs across all 31 local authorities\n`);

    const { error } = await supabase
        .from('rent_register_lea_ref')
        .upsert(ALL_LEAS, { onConflict: 'osi_lea_id' });

    if (error) {
        console.error('Upsert failed:', error.message);
        process.exit(1);
    }

    // Verify
    const { data: all, error: readErr } = await supabase
        .from('rent_register_lea_ref')
        .select('local_authority_id, local_authority_name, lea_name, osi_lea_id, is_dublin')
        .order('local_authority_id')
        .order('lea_name');

    if (readErr) {
        console.error('Verification read failed:', readErr.message);
        process.exit(1);
    }

    console.log(`✅ Seeded ${all.length} LEAs:\n`);

    let lastLa = null;
    for (const r of all) {
        if (r.local_authority_name !== lastLa) {
            console.log(`\n${r.local_authority_name} (LA ${r.local_authority_id}):`);
            lastLa = r.local_authority_name;
        }
        console.log(`  ${r.osi_lea_id}  ${r.lea_name}`);
    }

    const dublinCount = all.filter(r => r.is_dublin).length;
    const nationalCount = all.filter(r => !r.is_dublin).length;
    console.log(`\nSummary: ${dublinCount} Dublin LEAs + ${nationalCount} national LEAs = ${all.length} total`);
    console.log('\nYou can now run the full national scrape:');
    console.log('  node scripts/scrape-rent-register.mjs');
    console.log('\nOr Dublin only:');
    console.log('  node scripts/scrape-rent-register.mjs --la 29');
}

main().catch(err => { console.error(err); process.exit(1); });
