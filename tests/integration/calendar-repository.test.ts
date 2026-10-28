import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DrizzleCalendarRepository } from '../../src/infrastructure/repositories/drizzle-calendar-repository.js';
import { startTestDatabase, type TestDatabase } from './support/database.js';
import { lecSnapshot, snapshotMatch } from './support/snapshots.js';

describe('DrizzleCalendarRepository', () => {
  let database: TestDatabase;
  let calendar: DrizzleCalendarRepository;

  beforeAll(async () => {
    database = await startTestDatabase();
    calendar = new DrizzleCalendarRepository(database.handle.db);
  });
  afterAll(() => database.stop());
  beforeEach(() => database.reset());

  const twoWeeks = () =>
    lecSnapshot([
      snapshotMatch({ ref: 'w1m1', scheduledAt: new Date('2026-07-24T16:00:00Z') }),
      snapshotMatch({
        ref: 'w1m2',
        matchDay: 2,
        team1: 'Karmine Corp',
        scheduledAt: new Date('2026-07-25T16:00:00Z'),
      }),
      snapshotMatch({
        ref: 'w2m1',
        weekName: 'Week 2',
        scheduledAt: new Date('2026-07-31T16:00:00Z'),
        team2: null,
      }),
    ]);

  it('stores a snapshot and exposes weeks spanning their matches', async () => {
    await calendar.applySnapshot(twoWeeks());

    const found = await calendar.findWeeksBetween(
      ['lec'],
      new Date('2026-07-20T00:00:00Z'),
      new Date('2026-08-10T00:00:00Z'),
    );
    expect(
      found.map(({ name, competitionId, startsAt, endsAt }) => ({ name, competitionId, startsAt, endsAt })),
    ).toEqual([
      {
        name: 'Week 1',
        competitionId: 'lec',
        startsAt: new Date('2026-07-24T16:00:00Z'),
        endsAt: new Date('2026-07-25T16:00:00Z'),
      },
      {
        name: 'Week 2',
        competitionId: 'lec',
        startsAt: new Date('2026-07-31T16:00:00Z'),
        endsAt: new Date('2026-07-31T16:00:00Z'),
      },
    ]);
  });

  it('only returns weeks overlapping the window, for the requested competitions', async () => {
    await calendar.applySnapshot(twoWeeks());
    const window = [new Date('2026-07-26T00:00:00Z'), new Date('2026-08-10T00:00:00Z')] as const;
    expect((await calendar.findWeeksBetween(['lec'], ...window)).map((w) => w.name)).toEqual(['Week 2']);
    expect(await calendar.findWeeksBetween(['worlds'], ...window)).toEqual([]);
    expect(await calendar.findWeeksBetween([], ...window)).toEqual([]);
  });

  it('is idempotent and follows provider changes (dates, results, teams)', async () => {
    await calendar.applySnapshot(twoWeeks());
    const moved = twoWeeks();
    await calendar.applySnapshot({
      ...moved,
      matches: moved.matches.map((m) =>
        m.ref === 'w1m1'
          ? {
              ...m,
              scheduledAt: new Date('2026-07-24T18:00:00Z'),
              status: 'completed',
              result: { winner: 2, score: { team1: 1, team2: 2 } },
            }
          : m.ref === 'w2m1'
            ? { ...m, team2: 'Karmine Corp' }
            : m,
      ),
    });

    const [week1, week2] = await calendar.findWeeksBetween(
      ['lec'],
      new Date('2026-07-01'),
      new Date('2026-09-01'),
    );
    if (!week1 || !week2) throw new Error('weeks missing');
    const week1Matches = await calendar.findWeekMatches(week1.id);
    expect(week1Matches).toHaveLength(2);
    expect(week1Matches[0]).toMatchObject({
      scheduledAt: new Date('2026-07-24T18:00:00Z'),
      status: 'completed',
      bestOf: 3,
      result: { winner: 2, score: { team1: 1, team2: 2 } },
    });
    const [week2Match] = await calendar.findWeekMatches(week2.id);
    expect(week2Match?.team2Id).not.toBeNull();
  });

  it('builds week views with teams, ordered by time', async () => {
    await calendar.applySnapshot(twoWeeks());
    const [week1, week2] = await calendar.findWeeksBetween(
      ['lec'],
      new Date('2026-07-01'),
      new Date('2026-09-01'),
    );
    if (!week1 || !week2) throw new Error('weeks missing');

    const views = await calendar.findWeekViews([week2.id, week1.id]);

    expect(views.map((v) => [v.week.name, v.competitionName, v.matches.length])).toEqual([
      ['Week 1', 'LEC', 2],
      ['Week 2', 'LEC', 1],
    ]);
    expect(views[0]?.matches[0]).toMatchObject({
      bestOf: 3,
      matchDay: 1,
      status: 'scheduled',
      team1: { name: 'G2 Esports', shortName: 'G2', emojiId: null },
      team2: { name: 'Fnatic', shortName: 'FNC' },
    });
    expect(views[1]?.matches[0]?.team2).toBeNull();
    expect(await calendar.findWeekViews([])).toEqual([]);
  });

  it('prefixes weeks of a later stage with the stage name', async () => {
    const PLAYOFFS = 'LEC/2026 Season/Summer Playoffs';
    const base = lecSnapshot([snapshotMatch({ ref: 'regular' })]);
    await calendar.applySnapshot({
      ...base,
      tournaments: [
        ...base.tournaments,
        {
          ref: PLAYOFFS,
          seasonKey: '2026 Summer',
          name: 'LEC 2026 Summer Playoffs',
          startsOn: null,
          endsOn: null,
        },
      ],
      weeks: [...base.weeks, { tournamentRef: PLAYOFFS, name: 'Week 1', order: 1 }],
      matches: [
        ...base.matches,
        snapshotMatch({
          ref: 'final',
          tournamentRef: PLAYOFFS,
          scheduledAt: new Date('2026-08-29T16:00:00Z'),
        }),
      ],
    });

    const weeks = await calendar.findWeeksBetween(['lec'], new Date('2026-07-01'), new Date('2026-09-01'));
    expect(weeks.map((week) => week.name)).toEqual(['Week 1', 'Playoffs · Week 1']);
    const views = await calendar.findWeekViews(weeks.map((week) => week.id));
    expect(views.map((view) => view.week.name)).toEqual(['Week 1', 'Playoffs · Week 1']);
  });

  it('finds a match by id', async () => {
    await calendar.applySnapshot(twoWeeks());
    const [week1] = await calendar.findWeeksBetween(['lec'], new Date('2026-07-01'), new Date('2026-09-01'));
    const [first] = await calendar.findWeekMatches(week1?.id ?? 0);
    expect(await calendar.findMatch(first?.id ?? 0)).toEqual(first);
    expect(await calendar.findMatch(999_999)).toBeNull();
  });

  it('lists teams of recent or upcoming matches that need an emoji', async () => {
    await calendar.applySnapshot(twoWeeks());
    const missing = await calendar.findTeamsMissingEmoji(new Date('2026-07-26T00:00:00Z'), 10);
    // FNC has no logo: it is listed too, an emoji added by hand can still fill the gap.
    expect(missing.map((t) => [t.shortName, t.logoUrl !== null])).toEqual([
      ['G2', true],
      ['FNC', false],
      ['KC', true],
    ]);

    const g2 = missing.find((t) => t.shortName === 'G2');
    await calendar.setTeamEmoji(g2?.id ?? 0, '123456');
    expect(
      (await calendar.findTeamsMissingEmoji(new Date('2026-07-26T00:00:00Z'), 10)).map((t) => t.shortName),
    ).toEqual(['FNC', 'KC']);
    expect(await calendar.findTeamsMissingEmoji(new Date('2026-12-01T00:00:00Z'), 10)).toEqual([]);
  });

  it('keeps a known logo when the provider stops returning it', async () => {
    await calendar.applySnapshot(twoWeeks());
    const snapshot = twoWeeks();
    await calendar.applySnapshot({
      ...snapshot,
      teams: snapshot.teams.map((t) => ({ ...t, logoUrl: null })),
    });
    const missing = await calendar.findTeamsMissingEmoji(new Date('2026-07-26T00:00:00Z'), 10);
    expect(missing.map((t) => t.logoUrl)).toEqual(['https://img/g2.png', null, 'https://img/kc.png']);
  });
});
