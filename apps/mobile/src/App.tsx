import { API_ENABLED } from './features';
import { styles, color } from './theme';
import { Icon, Button, Field, Footer, Brand, Section, Empty, Stat, Card } from './components/ui';
import AuthScreen from './AuthScreen';
import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Platform,
  Alert,
  Linking,
  ActivityIndicator,
  AppState,
  Modal,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Svg, { Path, Circle } from 'react-native-svg';
import * as Network from 'expo-network';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { auth, useAppSession, request, json, API_URL } from './auth';
import { listRuns, pointsFor, getRun, deleteRun, clearOwner, type LocalRun } from './storage';
import { startRun, pauseRun, resumeRun, finishRun, recoverRun, stopCapture } from './tracker';
import { syncPending } from './sync';
import {
  calculateMetrics,
  formatDistance,
  formatDuration,
  formatPace,
  type ActivitySummary,
  type TrackPoint,
  type Visibility,
} from '@livesrun/core';
import RouteMap from './components/RouteMap';
import { demoProfile, demoActivities } from './demo';

type Profile = {
  userId: string;
  name: string;
  handle: string;
  bio: string;
  role: string;
  email?: string;
};
type Comment = { id: string; body: string; author: string; userId: string; createdAt: string };
type Person = {
  id: string;
  name: string;
  handle: string;
  bio?: string;
  followStatus?: string | null;
};
type Page = 'home' | 'record' | 'history' | 'profile';

const visibilityLabels: Record<Visibility, string> = {
  private: 'Só eu',
  followers: 'Seguidores',
  community: 'Comunidade',
};
async function confirmAction(title: string, text: string) {
  if (Platform.OS === 'web') return globalThis.confirm(`${title}\n${text}`);
  return new Promise<boolean>((resolve) =>
    Alert.alert(
      title,
      text,
      [
        { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Confirmar', style: 'destructive', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    ),
  );
}

export default function App() {
  const { data: session, isPending } = useAppSession();
  const [demo, setDemo] = useState(!API_ENABLED),
    [page, setPage] = useState<Page>('home');
  const [profile, setProfile] = useState<Profile | null>(null),
    [feed, setFeed] = useState<ActivitySummary[]>([]),
    [history, setHistory] = useState<ActivitySummary[]>([]),
    [pending, setPending] = useState<LocalRun[]>([]);
  const [weeklyTotals, setWeeklyTotals] = useState<{
    current: { distanceMeters: number; activities: number; activeDays: string[] };
    previous: { distanceMeters: number; activities: number; activeDays: string[] };
  } | null>(null);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [failure, setFailure] = useState(false),
    [feedCursor, setFeedCursor] = useState<string | null>(null),
    [historyCursor, setHistoryCursor] = useState<string | null>(null),
    [discover, setDiscover] = useState(false);
  const [selected, setSelected] = useState<ActivitySummary | null>(null),
    [route, setRoute] = useState<TrackPoint[]>([]),
    [comments, setComments] = useState<Comment[]>([]),
    [commentCursor, setCommentCursor] = useState<string | null>(null),
    [commentText, setCommentText] = useState(''),
    [caption, setCaption] = useState(''),
    [visibility, setVisibility] = useState<Visibility>('private');
  const [run, setRun] = useState<LocalRun | null>(null),
    [runPoints, setRunPoints] = useState<TrackPoint[]>([]),
    [tick, setTick] = useState(Date.now()),
    [sport, setSport] = useState<'run' | 'walk'>('run');
  const [query, setQuery] = useState(''),
    [people, setPeople] = useState<Person[]>([]),
    [requests, setRequests] = useState<Person[]>([]),
    [blocks, setBlocks] = useState<{ id: string; name: string }[]>([]),
    [reports, setReports] = useState<
      { id: string; targetType: string; targetId: string; reason: string; status: string }[]
    >([]);
  const [reporting, setReporting] = useState<{
      targetType: 'activity' | 'profile' | 'comment';
      targetId: string;
    } | null>(null),
    [reportReason, setReportReason] = useState('');
  const [editing, setEditing] = useState(false),
    [editName, setEditName] = useState(''),
    [editHandle, setEditHandle] = useState(''),
    [editBio, setEditBio] = useState('');
  const owner = demo ? 'demo' : session?.user.id;
  const notify = (text: string, error = false) => {
    setMessage(text);
    setFailure(error);
  };
  const perform = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Não foi possível concluir.', true);
    } finally {
      setBusy(false);
    }
  };
  const requireLive = () => {
    if (demo) {
      notify('Este MVP usa dados fictícios. Esta ação será conectada em uma próxima etapa.');
      return false;
    }
    return true;
  };
  const load = useCallback(async () => {
    if (demo) {
      setWeeklyTotals(null);
      setProfile(demoProfile);
      setFeed(demoActivities.filter((a) => a.visibility !== 'private'));
      setHistory(demoActivities.filter((a) => a.ownerId === 'demo'));
      return;
    }
    if (!session?.user.emailVerified) return;
    const p = await request<Profile>('/v1/me');
    setProfile(p);
    setWeeklyTotals(await request('/v1/me/weekly'));
    const [activities, posts, local] = await Promise.all([
      request<{ items: ActivitySummary[]; nextCursor: string | null }>('/v1/activities'),
      request<{ items: ActivitySummary[]; nextCursor: string | null }>(
        `/v1/feed?discover=${discover}`,
      ),
      listRuns(session.user.id),
    ]);
    setHistory(activities.items);
    setHistoryCursor(activities.nextCursor);
    setFeed(posts.items);
    setFeedCursor(posts.nextCursor);
    setPending(local.filter((r) => r.status === 'finished' && !r.synced));
    const active = local.find((r) => r.status !== 'finished');
    if (active) {
      setRun(await recoverRun(active.id));
      setRunPoints(await pointsFor(active.id));
    }
  }, [demo, session?.user.id, session?.user.emailVerified, discover]);
  useEffect(() => {
    void load().catch((e) => notify(e.message, true));
  }, [load]);
  useEffect(() => {
    if (!owner || demo) return;
    const sync = () =>
      void syncPending(owner)
        .then(load)
        .catch(() => {});
    sync();
    const app = AppState.addEventListener('change', (state) => {
      if (state === 'active') sync();
    });
    const network = Network.addNetworkStateListener((state) => {
      if (state.isConnected) sync();
    });
    return () => {
      app.remove();
      network.remove();
    };
  }, [owner, demo, load]);
  useEffect(() => {
    if (!run || run.status === 'finished') return;
    const timer = setInterval(() => {
      setTick(Date.now());
      void getRun(run.id).then((r) => {
        if (r) setRun(r);
      });
      void pointsFor(run.id).then(setRunPoints);
    }, 1500);
    return () => clearInterval(timer);
  }, [run?.id, run?.status]);
  useEffect(() => {
    if (page !== 'profile' || demo || !owner) return;
    void Promise.all([
      request<{ items: Person[] }>('/v1/follow-requests'),
      request<{ items: { id: string; name: string }[] }>('/v1/blocks'),
    ])
      .then(([a, b]) => {
        setRequests(a.items);
        setBlocks(b.items);
      })
      .catch((e) => notify(e.message, true));
  }, [page, owner, demo]);
  async function openActivity(activity: ActivitySummary) {
    setSelected(activity);
    setCaption(activity.caption);
    setVisibility(activity.visibility);
    setRoute([]);
    setComments([]);
    setCommentCursor(null);
    if (demo) return;
    await perform(async () => {
      const fresh = await request<ActivitySummary>(`/v1/activities/${activity.id}`);
      setSelected(fresh);
      const response = await request<{ items: Comment[]; nextCursor: string | null }>(
        `/v1/activities/${activity.id}/comments`,
      );
      setComments(response.items);
      setCommentCursor(response.nextCursor);
      if (activity.ownerId === owner)
        setRoute(
          (await request<{ points: TrackPoint[] }>(`/v1/activities/${activity.id}/route`)).points,
        );
    });
  }
  async function like(activity: ActivitySummary) {
    if (!requireLive()) return;
    await perform(async () => {
      await request(`/v1/activities/${activity.id}/like`, {
        method: activity.liked ? 'DELETE' : 'PUT',
      });
      await load();
      if (selected?.id === activity.id) setSelected(await request(`/v1/activities/${activity.id}`));
    });
  }
  async function exportData() {
    const remote = await request<Record<string, unknown>>('/v1/me/export');
    const localRuns = await listRuns(owner!);
    const unsynced = await Promise.all(
      localRuns
        .filter((r) => !r.synced)
        .map(async (run) => ({ ...run, points: await pointsFor(run.id) })),
    );
    const data = { ...remote, unsyncedActivitiesOnDevice: unsynced };
    if (Platform.OS === 'web') {
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
      );
      const a = document.createElement('a');
      a.href = url;
      a.download = 'livesrun-dados.json';
      a.click();
      URL.revokeObjectURL(url);
    } else {
      const file = new File(Paths.cache, 'livesrun-dados.json');
      file.write(JSON.stringify(data, null, 2));
      await Sharing.shareAsync(file.uri, { mimeType: 'application/json' });
    }
    notify('Exportação preparada.');
  }
  const moveTo = (p: Page) => {
    setPage(p);
    setSelected(null);
    setMessage('');
  };
  const weekly = history.filter((a) => {
    const d = new Date(a.startedAt);
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    return d >= start && a.status === 'finished';
  });
  const days = new Set(weekly.map((a) => new Date(a.startedAt).toLocaleDateString('pt-BR'))).size;
  const metrics = run
    ? calculateMetrics(runPoints, [
        ...run.intervals,
        ...(run.openInterval !== null ? [{ start: run.openInterval, end: tick }] : []),
      ])
    : null;
  const welcome = demo || !!session?.user.emailVerified;
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safe}>
        <StatusBar style="light" />
        <View style={styles.header}>
          <Brand />
          {welcome ? (
            <View style={styles.row}>
              <View style={styles.beta}>
                <Text style={styles.betaText}>{demo ? 'DEMONSTRAÇÃO' : 'BETA FECHADO'}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Abrir perfil"
                onPress={() => moveTo('profile')}
                style={styles.smallAvatar}
              >
                <Text style={styles.avatarText}>
                  {(profile?.name ?? session?.user.name ?? 'A')[0]}
                </Text>
              </Pressable>
            </View>
          ) : (
            <Text style={styles.small}>EVERY MOVE HAS A STORY</Text>
          )}
        </View>
        {!!message && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Fechar aviso"
            onPress={() => setMessage('')}
            style={[styles.notice, failure && { borderColor: '#e48080' }]}
          >
            <Icon
              name={failure ? 'alert-circle-outline' : 'information-circle-outline'}
              tint={failure ? '#ffabab' : color.orange}
            />
            <Text style={[styles.body, { flex: 1 }]}>{message}</Text>
            <Icon name="close" />
          </Pressable>
        )}
        {busy && (
          <View style={{ position: 'absolute', right: 24, top: 96, zIndex: 50 }}>
            <ActivityIndicator color={color.orange} />
          </View>
        )}
        {!welcome ? (
          <ScrollView contentContainerStyle={styles.authContent}>
            {isPending ? (
              <ActivityIndicator color={color.orange} />
            ) : session && !session.user.emailVerified ? (
              <View style={[styles.card, { maxWidth: 520, width: '100%', alignSelf: 'center' }]}>
                <Icon name="mail-open-outline" size={38} tint={color.orange} />
                <Text style={styles.title}>Falta só confirmar seu e-mail.</Text>
                <Text style={styles.body}>
                  Abra o link enviado para {session.user.email}. Depois volte para entrar e começar
                  sua história.
                </Text>
                <Button
                  label="Já confirmei, atualizar"
                  onPress={() =>
                    void perform(async () => {
                      const result = await auth.getSession({ query: { disableCookieCache: true } });
                      if (result.error) throw new Error(result.error.message);
                      await load();
                    })
                  }
                />
                <Button
                  label="Reenviar confirmação"
                  variant="secondary"
                  onPress={() =>
                    void perform(async () => {
                      const result = await auth.sendVerificationEmail({
                        email: session.user.email,
                        callbackURL: API_URL + '/legal/terms',
                      });
                      if (result.error) throw new Error(result.error.message);
                      notify('Confira sua caixa de entrada.');
                    })
                  }
                />
                <Button label="Sair" variant="ghost" onPress={() => void auth.signOut()} />
              </View>
            ) : (
              <AuthScreen
                onDemo={() => {
                  setDemo(true);
                  setPage('home');
                }}
                notify={notify}
                perform={perform}
                busy={busy}
              />
            )}
            <Footer />
          </ScrollView>
        ) : (
          <>
            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
              {demo && (
                <View style={styles.demoBar}>
                  <Icon name="flask-outline" tint={color.orange} />
                  <Text style={[styles.small, { flex: 1 }]}>
                    MVP navegável · dados fictícios · sem conexão com banco.
                  </Text>
                  <Pressable
                    onPress={() => {
                      setDemo(false);
                      setProfile(null);
                      setHistory([]);
                      setFeed([]);
                      setSelected(null);
                      setPage('home');
                    }}
                    accessibilityRole="button"
                    disabled={!API_ENABLED}
                    style={!API_ENABLED ? { display: 'none' } : undefined}
                    accessibilityLabel="Sair da demonstração"
                  >
                    <Text style={{ color: color.orange, fontWeight: '700' }}>Sair</Text>
                  </Pressable>
                </View>
              )}
              {selected ? (
                <View style={{ gap: 22 }}>
                  <Button
                    label="Voltar"
                    icon="arrow-back"
                    variant="ghost"
                    onPress={() => {
                      setSelected(null);
                      setReporting(null);
                    }}
                  />
                  <Section
                    eyebrow={
                      selected.sport === 'run' ? 'SUA HISTÓRIA EM MOVIMENTO' : 'CADA PASSO IMPORTA'
                    }
                    title={
                      selected.author.name === profile?.name
                        ? 'Mais um movimento. Mais uma história.'
                        : `A história de ${selected.author.name}`
                    }
                  >
                    <Card
                      activity={selected}
                      onOpen={() => {}}
                      onLike={() => void like(selected)}
                    />
                  </Section>
                  {selected.ownerId === owner ? (
                    <>
                      <Text style={styles.small}>
                        <Icon name="lock-closed-outline" size={13} /> Seu mapa é privado, mesmo
                        quando você compartilha o treino.
                      </Text>
                      <RouteMap points={route} />
                      {selected.hasGaps && (
                        <Text style={styles.muted}>
                          O GPS teve lacunas. A distância considera somente os trechos medidos.
                        </Text>
                      )}
                      <View style={styles.card}>
                        <Field
                          label="A história deste treino"
                          value={caption}
                          onChange={setCaption}
                          multiline
                        />
                        <Text style={styles.label}>Quem pode ver o resumo?</Text>
                        <View style={styles.wrap}>
                          {(['private', 'followers', 'community'] as Visibility[]).map((v) => (
                            <Chip
                              key={v}
                              label={visibilityLabels[v]}
                              selected={visibility === v}
                              onPress={() => setVisibility(v)}
                            />
                          ))}
                        </View>
                        <Button
                          label="Salvar compartilhamento"
                          onPress={() => {
                            if (requireLive())
                              void perform(async () => {
                                const saved = await request<ActivitySummary>(
                                  `/v1/activities/${selected.id}`,
                                  { method: 'PATCH', body: json({ visibility, caption }) },
                                );
                                setSelected(saved);
                                await load();
                                notify('Visibilidade atualizada. O mapa continua privado.');
                              });
                          }}
                        />
                        <Button
                          label="Excluir atividade"
                          variant="danger"
                          onPress={() => {
                            if (requireLive())
                              void perform(async () => {
                                if (
                                  await confirmAction(
                                    'Excluir atividade?',
                                    'O treino e suas interações serão removidos.',
                                  )
                                ) {
                                  await request(`/v1/activities/${selected.id}`, {
                                    method: 'DELETE',
                                  });
                                  await deleteRun(selected.id);
                                  setSelected(null);
                                  await load();
                                }
                              });
                          }}
                        />
                      </View>
                    </>
                  ) : (
                    <View style={styles.row}>
                      <Button
                        label="Denunciar"
                        icon="flag-outline"
                        variant="secondary"
                        onPress={() => {
                          if (requireLive())
                            setReporting({ targetType: 'activity', targetId: selected.id });
                        }}
                      />
                      <Button
                        label="Bloquear atleta"
                        variant="ghost"
                        onPress={() => {
                          if (requireLive())
                            void perform(async () => {
                              if (
                                await confirmAction(
                                  'Bloquear atleta?',
                                  'Vocês deixarão de ver conteúdos e interagir.',
                                )
                              ) {
                                await request(`/v1/blocks/${selected.ownerId}`, { method: 'PUT' });
                                setSelected(null);
                                await load();
                              }
                            });
                        }}
                      />
                    </View>
                  )}
                  <Section title="Incentivo que faz diferença">
                    <View style={styles.card}>
                      <Field
                        label="Deixe uma mensagem de incentivo"
                        value={commentText}
                        onChange={setCommentText}
                        multiline
                      />
                      <Button
                        label="Enviar comentário"
                        disabled={!commentText.trim() || busy}
                        icon="send-outline"
                        onPress={() => {
                          if (requireLive())
                            void perform(async () => {
                              await request(`/v1/activities/${selected.id}/comments`, {
                                method: 'POST',
                                body: json({ body: commentText }),
                              });
                              setCommentText('');
                              setComments(
                                (
                                  await request<{ items: Comment[] }>(
                                    `/v1/activities/${selected.id}/comments`,
                                  )
                                ).items,
                              );
                              setSelected(await request(`/v1/activities/${selected.id}`));
                            });
                        }}
                      />
                      {!comments.length && (
                        <Text style={styles.muted}>
                          Uma palavra de incentivo pode mudar o próximo treino.
                        </Text>
                      )}
                      {comments.map((c) => (
                        <View key={c.id} style={styles.comment}>
                          <Text style={styles.name}>{c.author}</Text>
                          <Text style={styles.body}>{c.body}</Text>
                          <View style={styles.wrap}>
                            {(c.userId === owner || selected.ownerId === owner) && (
                              <Button
                                label="Remover"
                                variant="ghost"
                                onPress={() =>
                                  void perform(async () => {
                                    await request(`/v1/comments/${c.id}`, { method: 'DELETE' });
                                    setComments(comments.filter((x) => x.id !== c.id));
                                  })
                                }
                              />
                            )}
                            <Button
                              label="Denunciar comentário"
                              variant="ghost"
                              onPress={() =>
                                setReporting({ targetType: 'comment', targetId: c.id })
                              }
                            />
                          </View>
                        </View>
                      ))}
                      {commentCursor && (
                        <Button
                          label="Mais comentários"
                          variant="secondary"
                          onPress={() =>
                            void perform(async () => {
                              const result = await request<{
                                items: Comment[];
                                nextCursor: string | null;
                              }>(`/v1/activities/${selected.id}/comments?cursor=${commentCursor}`);
                              setComments([...comments, ...result.items]);
                              setCommentCursor(result.nextCursor);
                            })
                          }
                        />
                      )}
                    </View>
                  </Section>
                </View>
              ) : page === 'home' ? (
                <View style={{ gap: 28 }}>
                  <View
                    style={[
                      styles.row,
                      { justifyContent: 'space-between', alignItems: 'flex-start' },
                    ]}
                  >
                    <View style={{ gap: 8, flex: 1 }}>
                      <Text style={styles.eyebrow}>O SEU RITMO. A SUA HISTÓRIA.</Text>
                      <Text style={styles.title}>
                        Vamos escrever o{Platform.OS === 'web' ? ' próximo' : '\npróximo'} capítulo,{' '}
                        {profile?.name.split(' ')[0] ?? 'atleta'}?
                      </Text>
                      <Text style={styles.muted}>
                        Você não precisa ir mais rápido. Só precisa começar.
                      </Text>
                    </View>
                  </View>
                  <View style={styles.hero}>
                    <View style={{ flex: 1, gap: 16, zIndex: 1 }}>
                      <View style={styles.row}>
                        <View style={styles.dot} />
                        <Text style={styles.eyebrow}>CADA MOVIMENTO CONTA</Text>
                      </View>
                      <Text style={styles.heroTitle}>O próximo passo{`\n`}é todo seu.</Text>
                      <Text style={[styles.body, { maxWidth: 330, color: '#d4dadc' }]}>
                        Corra, caminhe, respire. Grandes histórias também começam devagar.
                      </Text>
                      <View style={{ alignSelf: 'flex-start' }}>
                        <Button
                          label="Começar meu treino"
                          icon="arrow-forward"
                          onPress={() => moveTo('record')}
                        />
                      </View>
                    </View>
                    <View style={styles.routeArt} pointerEvents="none">
                      <Svg viewBox="0 0 340 300" width="100%" height="100%">
                        <Path
                          d="M310 35 C110 -5 325 175 130 110 S-30 180 110 185 S310 260 170 288"
                          fill="none"
                          stroke="#35423f"
                          strokeWidth={34}
                        />
                        <Path
                          d="M310 35 C110 -5 325 175 130 110 S-30 180 110 185 S310 260 170 288"
                          fill="none"
                          stroke={color.orange}
                          strokeWidth={3}
                          strokeDasharray="7 7"
                        />
                        <Circle cx={310} cy={35} r={10} fill={color.orange} />
                        <Circle cx={170} cy={288} r={10} fill="#fff" />
                      </Svg>
                    </View>
                  </View>
                  <View style={styles.card}>
                    <View style={[styles.row, { justifyContent: 'space-between' }]}>
                      <Text style={styles.cardTitle}>Sua semana em movimento</Text>
                      <Text style={styles.small}>SEG — DOM</Text>
                    </View>
                    <View style={styles.row}>
                      <Stat
                        value={formatDistance(
                          weeklyTotals?.current.distanceMeters ??
                            weekly.reduce((n, a) => n + a.distanceMeters, 0),
                        )}
                        unit="km"
                        label="Distância percorrida"
                      />
                      <Stat
                        value={String(weeklyTotals?.current.activities ?? weekly.length).padStart(
                          2,
                          '0',
                        )}
                        label="Histórias registradas"
                      />
                      <Stat
                        value={String(weeklyTotals?.current.activeDays.length ?? days).padStart(
                          2,
                          '0',
                        )}
                        label="Dias em movimento"
                      />
                    </View>
                    <View style={styles.weekDays}>
                      {['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map((d, i) => {
                        const date = new Date();
                        date.setHours(0, 0, 0, 0);
                        date.setDate(date.getDate() - ((date.getDay() + 6) % 7) + i);
                        const active = weeklyTotals
                          ? weeklyTotals.current.activeDays.includes(
                              date.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
                            )
                          : weekly.some(
                              (a) => new Date(a.startedAt).toDateString() === date.toDateString(),
                            );
                        return (
                          <View key={i} style={{ alignItems: 'center', gap: 10 }}>
                            <View
                              style={[
                                styles.day,
                                active && {
                                  backgroundColor: color.orange,
                                  borderColor: color.orange,
                                },
                              ]}
                            >
                              {active ? (
                                <Icon name="checkmark" tint="#111" size={18} />
                              ) : (
                                <View
                                  style={[
                                    styles.dot,
                                    { backgroundColor: '#586168', width: 5, height: 5 },
                                  ]}
                                />
                              )}
                            </View>
                            <Text style={styles.small}>{d}</Text>
                          </View>
                        );
                      })}
                    </View>
                    {weeklyTotals && (
                      <Text style={styles.small}>
                        Semana anterior: {formatDistance(weeklyTotals.previous.distanceMeters)} km
                        em {weeklyTotals.previous.activities} treino(s). Compare seu caminho,
                        respeitando seu momento.
                      </Text>
                    )}
                    <Text style={styles.small}>
                      Cada dia ativo é uma conquista. Respeite também seus dias de descanso.
                    </Text>
                  </View>
                  <Section title="Histórias que inspiram" eyebrow="MOVIMENTO COMPARTILHADO">
                    <View style={[styles.row, { justifyContent: 'space-between' }]}>
                      <View style={styles.wrap}>
                        <Chip
                          label="Seguindo"
                          selected={!discover}
                          onPress={() => setDiscover(false)}
                        />
                        <Chip
                          label="Comunidade"
                          selected={discover}
                          onPress={() => setDiscover(true)}
                        />
                      </View>
                      <Button
                        label="Encontrar atletas"
                        variant="ghost"
                        icon="search-outline"
                        onPress={() => moveTo('profile')}
                      />
                    </View>
                    {feed.length ? (
                      feed.map((a) => (
                        <Card
                          key={a.id}
                          activity={a}
                          onOpen={() => void openActivity(a)}
                          onLike={() => void like(a)}
                        />
                      ))
                    ) : (
                      <Empty
                        icon="people-outline"
                        title="Sua comunidade começa aqui"
                        text="Encontre atletas, siga suas histórias e compartilhe um treino quando quiser."
                      />
                    )}
                    {feedCursor && (
                      <Button
                        label="Ver mais histórias"
                        variant="secondary"
                        onPress={() =>
                          void perform(async () => {
                            const r = await request<{
                              items: ActivitySummary[];
                              nextCursor: string | null;
                            }>(`/v1/feed?discover=${discover}&cursor=${feedCursor}`);
                            setFeed([...feed, ...r.items]);
                            setFeedCursor(r.nextCursor);
                          })
                        }
                      />
                    )}
                  </Section>
                </View>
              ) : page === 'record' ? (
                <View style={{ gap: 24 }}>
                  <Section
                    eyebrow="SEM PRESSA. SEM COMPARAÇÃO."
                    title={run ? 'Seu momento de movimento' : 'Como você quer se mover hoje?'}
                  >
                    <Text style={styles.muted}>
                      O percurso fica só com você. Compartilhar é sempre uma escolha.
                    </Text>
                  </Section>
                  {!run ? (
                    <>
                      <View style={styles.sportGrid}>
                        {(
                          [
                            {
                              id: 'run',
                              label: 'Corrida',
                              sub: 'Encontre o seu ritmo',
                              icon: 'fitness-outline',
                            },
                            {
                              id: 'walk',
                              label: 'Caminhada',
                              sub: 'Um passo de cada vez',
                              icon: 'footsteps-outline',
                            },
                          ] as const
                        ).map((s) => (
                          <Pressable
                            key={s.id}
                            accessibilityRole="button"
                            accessibilityState={{ selected: sport === s.id }}
                            onPress={() => setSport(s.id)}
                            style={[
                              styles.sportCard,
                              sport === s.id && {
                                borderColor: color.orange,
                                backgroundColor: '#251d18',
                              },
                            ]}
                          >
                            <Icon
                              name={s.icon}
                              size={38}
                              tint={sport === s.id ? color.orange : color.muted}
                            />
                            <Text style={styles.cardTitle}>{s.label}</Text>
                            <Text style={styles.small}>{s.sub}</Text>
                          </Pressable>
                        ))}
                      </View>
                      <View style={styles.card}>
                        <View style={styles.row}>
                          <Icon name="location-outline" tint={color.orange} />
                          <Text style={styles.cardTitle}>Pronto para sair?</Text>
                        </View>
                        <Text style={styles.body}>
                          Encontre um lugar aberto, ative o GPS e permita localização durante o
                          treino. A gravação continua com a tela bloqueada.
                        </Text>
                        <Text style={styles.small}>
                          Sem internet? Seu treino fica salvo no aparelho até poder sincronizar.
                        </Text>
                        {Platform.OS === 'web' && (
                          <Text style={{ color: color.orange, lineHeight: 22 }}>
                            A gravação está disponível no app Android e iOS. Esta versão web permite
                            explorar a experiência e acessar sua conta.
                          </Text>
                        )}
                        <Button
                          label="Iniciar treino"
                          icon="play"
                          disabled={busy}
                          onPress={() => {
                            if (requireLive())
                              void perform(async () => {
                                try {
                                  setRun(await startRun(owner!, sport));
                                  setTick(Date.now());
                                  setRunPoints([]);
                                } catch (e) {
                                  const local = (await listRuns(owner!)).find(
                                    (r) => r.status !== 'finished',
                                  );
                                  if (local) setRun(local);
                                  throw e;
                                }
                              });
                          }}
                        />
                      </View>
                    </>
                  ) : (
                    <>
                      <View style={[styles.card, { alignItems: 'center', paddingVertical: 36 }]}>
                        <View style={styles.row}>
                          <View
                            style={[
                              styles.dot,
                              {
                                backgroundColor: run.status === 'paused' ? '#d6be74' : color.orange,
                              },
                            ]}
                          />
                          <Text style={styles.eyebrow}>
                            {run.status === 'paused'
                              ? 'TREINO PAUSADO'
                              : run.sport === 'run'
                                ? 'CORRIDA EM ANDAMENTO'
                                : 'CAMINHADA EM ANDAMENTO'}
                          </Text>
                        </View>
                        <Text style={styles.recordDistance}>
                          {formatDistance(metrics?.distanceMeters ?? 0)}
                        </Text>
                        <Text style={styles.eyebrow}>QUILÔMETROS</Text>
                        <View style={[styles.row, { width: '100%', marginTop: 30 }]}>
                          <Stat
                            value={formatDuration(metrics?.durationSeconds ?? 0)}
                            label="Tempo ativo"
                          />
                          <Stat
                            value={formatPace(metrics?.paceSecondsPerKm ?? null)}
                            label="Ritmo médio /km"
                          />
                        </View>
                      </View>
                      <RouteMap points={runPoints} />
                      {(run.hasGaps || metrics?.hasGaps) && (
                        <Text style={styles.muted}>
                          Há trechos sem sinal válido. Apenas a distância medida será contabilizada.
                        </Text>
                      )}
                      <View style={styles.wrap}>
                        <Button
                          label={run.status === 'paused' ? 'Retomar' : 'Pausar'}
                          icon={run.status === 'paused' ? 'play' : 'pause'}
                          onPress={() =>
                            void perform(async () =>
                              setRun(
                                run.status === 'paused'
                                  ? await resumeRun(run.id)
                                  : await pauseRun(run.id),
                              ),
                            )
                          }
                        />
                        <Button
                          label="Concluir treino"
                          icon="checkmark"
                          variant="secondary"
                          onPress={() =>
                            void perform(async () => {
                              const saved = await finishRun(run.id);
                              setRun(null);
                              setRunPoints([]);
                              if (saved) {
                                notify('Treino salvo no aparelho. Sincronizando…');
                                try {
                                  await syncPending(owner!);
                                  notify('Mais uma história registrada. Seu treino está privado.');
                                } catch {
                                  notify(
                                    'Treino salvo no aparelho. A sincronização será retomada quando a conexão voltar.',
                                  );
                                }
                                await load();
                                setPage('history');
                              }
                            })
                          }
                        />
                      </View>
                      <Button
                        label="Descartar treino"
                        variant="ghost"
                        onPress={() =>
                          void perform(async () => {
                            if (
                              await confirmAction(
                                'Descartar treino?',
                                'Os pontos já gravados serão removidos do aparelho.',
                              )
                            ) {
                              await stopCapture();
                              await deleteRun(run.id);
                              setRun(null);
                              setRunPoints([]);
                            }
                          })
                        }
                      />
                    </>
                  )}
                </View>
              ) : page === 'history' ? (
                <View style={{ gap: 24 }}>
                  <Section
                    eyebrow="VOCÊ JÁ CHEGOU ATÉ AQUI"
                    title="Sua história, um treino por vez."
                  >
                    <Text style={styles.muted}>Não importa a distância. O movimento é seu.</Text>
                  </Section>
                  {!!pending.length && (
                    <View style={styles.card}>
                      <Icon name="cloud-upload-outline" tint={color.orange} />
                      <Text style={styles.cardTitle}>
                        {pending.length} treino(s) salvo(s) neste aparelho
                      </Text>
                      <Text style={styles.muted}>
                        Ainda não sincronizados. Não exclua o aplicativo antes de enviar seus
                        treinos.
                      </Text>
                      {pending.map((r) => (
                        <Text key={r.id} style={styles.body}>
                          {r.sport === 'run' ? 'Corrida' : 'Caminhada'} ·{' '}
                          {new Date(r.startedAt).toLocaleString('pt-BR')}
                        </Text>
                      ))}
                      <Button
                        label="Sincronizar agora"
                        onPress={() =>
                          void perform(async () => {
                            await syncPending(owner!);
                            await load();
                            notify('Histórico atualizado.');
                          })
                        }
                      />
                    </View>
                  )}
                  <View style={styles.wrap}>
                    <Button
                      label="Atualizar histórico"
                      icon="refresh"
                      variant="secondary"
                      onPress={() => void perform(load)}
                    />
                    <Button label="Novo treino" icon="add" onPress={() => moveTo('record')} />
                  </View>
                  {history.length ? (
                    history.map((a) => (
                      <Card
                        key={a.id}
                        activity={a}
                        onOpen={() => void openActivity(a)}
                        onLike={() => void like(a)}
                      />
                    ))
                  ) : (
                    <Empty
                      title="Sua primeira história está por vir"
                      text="Comece uma corrida ou caminhada. Seus treinos aparecerão aqui."
                    />
                  )}
                  {historyCursor && (
                    <Button
                      label="Carregar mais treinos"
                      variant="secondary"
                      onPress={() =>
                        void perform(async () => {
                          const r = await request<{
                            items: ActivitySummary[];
                            nextCursor: string | null;
                          }>(`/v1/activities?cursor=${historyCursor}`);
                          setHistory([...history, ...r.items]);
                          setHistoryCursor(r.nextCursor);
                        })
                      }
                    />
                  )}
                </View>
              ) : (
                <View style={{ gap: 24 }}>
                  <Section eyebrow="MUITO ALÉM DOS QUILÔMETROS" title="Essa história é sua.">
                    <View style={styles.card}>
                      <View style={styles.row}>
                        <View style={[styles.avatar, { width: 64, height: 64 }]}>
                          <Text style={[styles.avatarText, { fontSize: 24 }]}>
                            {profile?.name[0]}
                          </Text>
                        </View>
                        <View>
                          <Text style={styles.sectionTitle}>{profile?.name}</Text>
                          <Text style={styles.muted}>@{profile?.handle}</Text>
                        </View>
                      </View>
                      <Text style={styles.body}>
                        {profile?.bio || 'Cada movimento conta uma história. Escreva a sua.'}
                      </Text>
                      <Button
                        label="Editar perfil"
                        icon="create-outline"
                        variant="secondary"
                        onPress={() => {
                          if (!requireLive()) return;
                          setEditing(!editing);
                          setEditName(profile?.name ?? '');
                          setEditHandle(profile?.handle ?? '');
                          setEditBio(profile?.bio ?? '');
                        }}
                      />
                      {editing && (
                        <>
                          <Field label="Nome" value={editName} onChange={setEditName} />
                          <Field
                            label="Nome de usuário"
                            value={editHandle}
                            onChange={setEditHandle}
                          />
                          <Field label="Sua bio" value={editBio} onChange={setEditBio} multiline />
                          <Button
                            label="Salvar perfil"
                            onPress={() =>
                              void perform(async () => {
                                await request('/v1/me', {
                                  method: 'PATCH',
                                  body: json({ name: editName, handle: editHandle, bio: editBio }),
                                });
                                setEditing(false);
                                await load();
                              })
                            }
                          />
                        </>
                      )}
                    </View>
                  </Section>
                  <Section title="Encontre seu próximo incentivo">
                    <View style={styles.card}>
                      <Field
                        label="Buscar atletas por nome ou usuário"
                        value={query}
                        onChange={setQuery}
                      />
                      <Button
                        label="Buscar atletas"
                        icon="search"
                        variant="secondary"
                        onPress={() => {
                          if (requireLive())
                            void perform(async () =>
                              setPeople(
                                (
                                  await request<{ items: Person[] }>(
                                    `/v1/athletes?q=${encodeURIComponent(query)}`,
                                  )
                                ).items,
                              ),
                            );
                        }}
                      />
                      {people.map((p) => (
                        <View key={p.id} style={styles.comment}>
                          <Text style={styles.name}>
                            {p.name} · @{p.handle}
                          </Text>
                          {p.id !== owner && (
                            <View style={styles.wrap}>
                              <Button
                                label={
                                  p.followStatus === 'approved'
                                    ? 'Deixar de seguir'
                                    : p.followStatus === 'pending'
                                      ? 'Cancelar solicitação'
                                      : 'Seguir atleta'
                                }
                                variant="secondary"
                                onPress={() =>
                                  void perform(async () => {
                                    await request(`/v1/athletes/${p.id}/follow`, {
                                      method: p.followStatus ? 'DELETE' : 'POST',
                                    });
                                    setPeople(
                                      people.map((x) =>
                                        x.id === p.id
                                          ? {
                                              ...x,
                                              followStatus: p.followStatus ? null : 'pending',
                                            }
                                          : x,
                                      ),
                                    );
                                  })
                                }
                              />
                              <Button
                                label="Ver treinos"
                                variant="ghost"
                                onPress={() =>
                                  void perform(async () => {
                                    const r = await request<{ items: ActivitySummary[] }>(
                                      `/v1/activities?athlete=${p.id}`,
                                    );
                                    if (!r.items.length)
                                      notify('Nenhum treino compartilhado disponível.');
                                    else {
                                      await openActivity(r.items[0]);
                                    }
                                  })
                                }
                              />
                              <Button
                                label="Denunciar perfil"
                                variant="ghost"
                                onPress={() =>
                                  setReporting({ targetType: 'profile', targetId: p.id })
                                }
                              />
                            </View>
                          )}
                        </View>
                      ))}
                    </View>
                  </Section>
                  {!!requests.length && (
                    <Section title="Querem acompanhar sua história">
                      {requests.map((p) => (
                        <View key={p.id} style={styles.card}>
                          <Text style={styles.name}>
                            {p.name} · @{p.handle}
                          </Text>
                          <View style={styles.wrap}>
                            <Button
                              label="Aprovar"
                              onPress={() =>
                                void perform(async () => {
                                  await request(`/v1/follow-requests/${p.id}/approve`, {
                                    method: 'POST',
                                  });
                                  setRequests(requests.filter((x) => x.id !== p.id));
                                })
                              }
                            />
                            <Button
                              label="Recusar"
                              variant="secondary"
                              onPress={() =>
                                void perform(async () => {
                                  await request(`/v1/follow-requests/${p.id}`, {
                                    method: 'DELETE',
                                  });
                                  setRequests(requests.filter((x) => x.id !== p.id));
                                })
                              }
                            />
                          </View>
                        </View>
                      ))}
                    </Section>
                  )}
                  <Section title="Privacidade e conta">
                    <View style={styles.card}>
                      <Text style={styles.body}>
                        Seus treinos começam privados. O mapa é sempre visível apenas para você.
                      </Text>
                      <Button
                        label="Exportar meus dados"
                        icon="download-outline"
                        variant="secondary"
                        onPress={() => {
                          if (requireLive()) void perform(exportData);
                        }}
                      />
                      <Button
                        label="Política de privacidade"
                        icon="shield-checkmark-outline"
                        variant="ghost"
                        onPress={() =>
                          API_ENABLED
                            ? void Linking.openURL(`${API_URL}/legal/privacy`)
                            : notify(
                                'No MVP, os dados exibidos são fictícios e ficam somente nesta sessão.',
                              )
                        }
                      />
                      <Button
                        label="Termos e regras da comunidade"
                        variant="ghost"
                        onPress={() =>
                          API_ENABLED
                            ? void Linking.openURL(`${API_URL}/legal/terms`)
                            : notify(
                                'Respeito, inclusão e incentivo: os princípios da comunidade LivesRun.',
                              )
                        }
                      />
                      {blocks.map((b) => (
                        <View key={b.id} style={styles.row}>
                          <Text style={[styles.body, { flex: 1 }]}>{b.name} · bloqueado</Text>
                          <Button
                            label="Desbloquear"
                            variant="ghost"
                            onPress={() =>
                              void perform(async () => {
                                await request(`/v1/blocks/${b.id}`, { method: 'DELETE' });
                                setBlocks(blocks.filter((x) => x.id !== b.id));
                              })
                            }
                          />
                        </View>
                      ))}
                      <Button
                        label={API_ENABLED ? 'Sair da conta' : 'Voltar ao início'}
                        icon="log-out-outline"
                        variant="secondary"
                        onPress={() =>
                          void perform(async () => {
                            if (demo && !API_ENABLED) {
                              setPage('home');
                              return;
                            }
                            if (demo) {
                              setDemo(false);
                            } else {
                              if (run)
                                throw new Error('Conclua ou descarte o treino antes de sair.');
                              await auth.signOut();
                            }
                            setProfile(null);
                            setFeed([]);
                            setHistory([]);
                            setPending([]);
                            setPage('home');
                          })
                        }
                      />
                      <Button
                        label="Excluir minha conta"
                        variant="danger"
                        onPress={() => {
                          if (requireLive())
                            void perform(async () => {
                              if (
                                await confirmAction(
                                  'Excluir sua conta?',
                                  'Sua conta, atividades e interações serão removidas. Exporte seus dados primeiro se desejar.',
                                )
                              ) {
                                await stopCapture();
                                await request('/v1/me', {
                                  method: 'DELETE',
                                  body: json({ confirmation: 'EXCLUIR' }),
                                });
                                await clearOwner(owner!);
                                await auth.signOut();
                                setProfile(null);
                                setRun(null);
                                setHistory([]);
                                setFeed([]);
                                setPending([]);
                                setPage('home');
                              }
                            });
                        }}
                      />
                    </View>
                  </Section>
                  {profile?.role === 'admin' && (
                    <Section title="Moderação do beta">
                      <Button
                        label="Carregar denúncias"
                        variant="secondary"
                        onPress={() =>
                          void perform(async () =>
                            setReports(
                              (await request<{ items: typeof reports }>('/v1/admin/reports')).items,
                            ),
                          )
                        }
                      />
                      {reports.map((r) => (
                        <View key={r.id} style={styles.card}>
                          <Text style={styles.name}>
                            {r.targetType} · {r.status}
                          </Text>
                          <Text style={styles.body}>{r.reason}</Text>
                          <Text selectable style={styles.small}>
                            {r.targetId}
                          </Text>
                          <View style={styles.wrap}>
                            <Button
                              label="Resolver denúncia"
                              variant="secondary"
                              onPress={() =>
                                void perform(async () => {
                                  await request('/v1/admin/actions', {
                                    method: 'POST',
                                    body: json({ action: 'resolve', targetId: r.id }),
                                  });
                                  setReports(
                                    reports.map((x) =>
                                      x.id === r.id ? { ...x, status: 'resolved' } : x,
                                    ),
                                  );
                                })
                              }
                            />
                            <Button
                              label={
                                r.targetType === 'profile' ? 'Suspender conta' : 'Remover conteúdo'
                              }
                              variant="danger"
                              onPress={() =>
                                void perform(async () => {
                                  if (
                                    await confirmAction(
                                      'Aplicar moderação?',
                                      'A ação será registrada no histórico administrativo.',
                                    )
                                  ) {
                                    await request('/v1/admin/actions', {
                                      method: 'POST',
                                      body: json({
                                        action:
                                          r.targetType === 'profile'
                                            ? 'suspend'
                                            : r.targetType === 'activity'
                                              ? 'remove_activity'
                                              : 'remove_comment',
                                        targetId: r.targetId,
                                      }),
                                    });
                                    notify('Ação de moderação aplicada.');
                                  }
                                })
                              }
                            />
                          </View>
                        </View>
                      ))}
                    </Section>
                  )}
                </View>
              )}
              <Footer />
            </ScrollView>
            <View style={styles.nav}>
              {(
                [
                  { id: 'home', label: 'Início', icon: 'grid-outline' },
                  { id: 'record', label: 'Registrar', icon: 'add-circle-outline' },
                  { id: 'history', label: 'Histórico', icon: 'stats-chart-outline' },
                  { id: 'profile', label: 'Perfil', icon: 'person-outline' },
                ] as const
              ).map((tab) => (
                <Pressable
                  accessibilityRole="tab"
                  accessibilityState={{ selected: page === tab.id && !selected }}
                  accessibilityLabel={tab.label}
                  key={tab.id}
                  onPress={() => moveTo(tab.id)}
                  style={styles.navItem}
                >
                  <Icon
                    name={tab.icon}
                    size={23}
                    tint={page === tab.id ? color.orange : color.muted}
                  />
                  <Text style={[styles.navLabel, page === tab.id && { color: color.orange }]}>
                    {tab.label}
                  </Text>
                  {page === tab.id && <View style={styles.navDot} />}
                </Pressable>
              ))}
            </View>
          </>
        )}
        <Modal
          visible={!!reporting}
          transparent
          animationType="fade"
          onRequestClose={() => setReporting(null)}
        >
          <View style={styles.modal}>
            <View style={[styles.card, { width: '100%', maxWidth: 500 }]}>
              <Text style={styles.sectionTitle}>Conte o que aconteceu</Text>
              <Text style={styles.muted}>
                A denúncia será analisada pela moderação. O autor não recebe sua identificação.
              </Text>
              <Field
                label="Motivo da denúncia"
                value={reportReason}
                onChange={setReportReason}
                multiline
              />
              <Button
                label="Enviar denúncia"
                disabled={reportReason.trim().length < 5 || busy}
                onPress={() =>
                  void perform(async () => {
                    await request('/v1/reports', {
                      method: 'POST',
                      body: json({ ...reporting, reason: reportReason }),
                    });
                    setReporting(null);
                    setReportReason('');
                    notify('Denúncia recebida. Obrigado por cuidar da comunidade.');
                  })
                }
              />
              <Button label="Cancelar" variant="ghost" onPress={() => setReporting(null)} />
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected && { backgroundColor: '#38251b', borderColor: '#b74e24' }]}
    >
      <Text style={{ color: selected ? '#ffad88' : color.muted, fontWeight: '600', fontSize: 13 }}>
        {label}
      </Text>
    </Pressable>
  );
}
