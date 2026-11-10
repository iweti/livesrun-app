import { API_ENABLED } from './features';
import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, Platform, Linking } from 'react-native';
import { auth, API_URL, json } from './auth';
import { styles, color } from './theme';
import { Field, Button, Icon } from './components/ui';
export default function AuthScreen({
  onDemo,
  notify,
  perform,
  busy,
}: {
  onDemo: () => void;
  notify: (s: string, e?: boolean) => void;
  perform: (fn: () => Promise<void>) => Promise<void>;
  busy: boolean;
}) {
  const [mode, setMode] = useState<'login' | 'signup' | 'reset' | 'newPassword'>('login'),
    [name, setName] = useState(''),
    [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [invite, setInvite] = useState(''),
    [adult, setAdult] = useState(false),
    [terms, setTerms] = useState(false),
    [token, setToken] = useState('');
  useEffect(() => {
    void Linking.getInitialURL().then((url) => {
      if (url) {
        const parsed = new URL(url);
        const t = parsed.searchParams.get('token');
        if (t) {
          setToken(t);
          setMode('newPassword');
        }
      }
    });
    const listener = Linking.addEventListener('url', ({ url }) => {
      const t = new URL(url).searchParams.get('token');
      if (t) {
        setToken(t);
        setMode('newPassword');
      }
    });
    return () => listener.remove();
  }, []);
  async function submit() {
    if (!API_ENABLED) throw new Error('Cadastro e login não estão conectados nesta etapa do MVP.');
    if (mode === 'signup') {
      const response = await fetch(API_URL + '/api/auth/sign-up/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(Platform.OS === 'web' ? {} : { 'expo-origin': 'livesrun://' }),
        },
        credentials: 'include',
        body: json({
          name,
          email: email.trim().toLowerCase(),
          password,
          inviteCode: invite.trim(),
          adultAccepted: adult,
          termsAccepted: terms,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? 'Não foi possível criar a conta.');
      notify('Conta criada. Confirme o e-mail recebido e depois entre.');
      setMode('login');
    } else if (mode === 'login') {
      const { error } = await auth.signIn.email({ email: email.trim().toLowerCase(), password });
      if (error) throw new Error(error.message ?? 'Confira seu e-mail e sua senha.');
    } else if (mode === 'reset') {
      const { error } = await auth.requestPasswordReset({
        email: email.trim().toLowerCase(),
        redirectTo:
          Platform.OS === 'web' ? globalThis.location.origin : 'livesrun://reset-password',
      });
      if (error) throw new Error(error.message);
      notify('Se houver uma conta com esse e-mail, enviaremos as instruções.');
    } else {
      const { error } = await auth.resetPassword({ newPassword: password, token });
      if (error) throw new Error(error.message);
      notify('Senha atualizada. Entre novamente.');
      setMode('login');
    }
  }
  return (
    <View style={styles.authGrid}>
      <View style={styles.authStory}>
        <Text style={styles.eyebrow}>PARA TODOS OS RITMOS</Text>
        <Text style={styles.authHeadline}>
          Cada movimento{`\n`}conta uma{`\n`}
          <Text style={{ color: color.orange }}>história.</Text>
        </Text>
        <Text style={[styles.muted, { fontSize: 18, lineHeight: 29, maxWidth: 430 }]}>
          Do primeiro quilômetro à próxima conquista. Um lugar para se mover, se conectar e evoluir
          no seu próprio ritmo.
        </Text>
        <View style={[styles.row, { marginTop: 16 }]}>
          <Icon name="footsteps-outline" tint={color.orange} />
          <Text style={styles.small}>MOVIMENTE-SE. CONECTE-SE. EVOLUA.</Text>
        </View>
      </View>
      <View style={[styles.card, styles.authForm]}>
        <Text style={styles.eyebrow}>BEM-VINDO À LIVESRUN</Text>
        <Text style={styles.sectionTitle}>
          {mode === 'login'
            ? 'Sua próxima história começa aqui.'
            : mode === 'signup'
              ? 'Todo começo merece incentivo.'
              : mode === 'reset'
                ? 'Vamos recuperar seu acesso.'
                : 'Escolha sua nova senha.'}
        </Text>
        <Text style={styles.muted}>
          {mode === 'signup'
            ? 'O beta é fechado para atletas adultos convidados.'
            : 'Entre para acompanhar suas conquistas e encontrar seu próximo incentivo.'}
        </Text>
        {mode === 'signup' && <Field label="Seu nome" value={name} onChange={setName} />}
        {mode !== 'newPassword' && <Field label="E-mail" value={email} onChange={setEmail} />}
        {mode !== 'reset' && (
          <Field
            label="Senha (mínimo 12 caracteres)"
            value={password}
            onChange={setPassword}
            secure
          />
        )}
        {mode === 'signup' && (
          <>
            <Field label="Convite do beta" value={invite} onChange={setInvite} />
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: adult }}
              onPress={() => setAdult(!adult)}
              style={styles.row}
            >
              <Icon
                name={adult ? 'checkbox' : 'square-outline'}
                tint={adult ? color.orange : color.muted}
              />
              <Text style={[styles.small, { flex: 1 }]}>Confirmo que tenho 18 anos ou mais.</Text>
            </Pressable>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: terms }}
              onPress={() => setTerms(!terms)}
              style={styles.row}
            >
              <Icon
                name={terms ? 'checkbox' : 'square-outline'}
                tint={terms ? color.orange : color.muted}
              />
              <Text style={[styles.small, { flex: 1 }]}>
                Li e aceito os termos e a política de privacidade.
              </Text>
            </Pressable>
            <View style={styles.wrap}>
              <Button
                label="Ler termos"
                variant="ghost"
                onPress={() => void Linking.openURL(API_URL + '/legal/terms')}
              />
              <Button
                label="Ler privacidade"
                variant="ghost"
                onPress={() => void Linking.openURL(API_URL + '/legal/privacy')}
              />
            </View>
          </>
        )}
        <Button
          label={
            mode === 'login'
              ? 'Entrar na minha história'
              : mode === 'signup'
                ? 'Criar minha conta'
                : mode === 'reset'
                  ? 'Enviar instruções'
                  : 'Salvar nova senha'
          }
          icon="arrow-forward"
          disabled={busy || (mode === 'signup' && (!adult || !terms))}
          onPress={() => void perform(submit)}
        />
        {mode === 'login' && (
          <Button label="Esqueci minha senha" variant="ghost" onPress={() => setMode('reset')} />
        )}
        <View style={styles.divider} />
        <Button
          label={mode === 'login' ? 'Tenho um convite para o beta' : 'Já tenho uma conta'}
          variant="secondary"
          onPress={() => setMode(mode === 'login' ? 'signup' : 'login')}
        />
        <Button
          label="Explorar demonstração"
          variant="ghost"
          icon="compass-outline"
          onPress={onDemo}
        />
        <Text style={[styles.small, { textAlign: 'center' }]}>
          Seus dados e seu percurso merecem cuidado.{`\n`}Atividades privadas por padrão.
        </Text>
      </View>
    </View>
  );
}
