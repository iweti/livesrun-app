import React from 'react';
import { View, Text, TextInput, Pressable, Linking } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { formatDistance, formatDuration, formatPace, type ActivitySummary } from '@livesrun/core';
import { styles, color } from '../theme';
type IconName = React.ComponentProps<typeof Ionicons>['name'];
export function Icon({
  name,
  size = 20,
  tint = color.muted,
}: {
  name: IconName;
  size?: number;
  tint?: string;
}) {
  return <Ionicons name={name} size={size} color={tint} />;
}
export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: IconName;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary'
          ? styles.primary
          : variant === 'danger'
            ? styles.danger
            : variant === 'secondary'
              ? styles.secondary
              : { backgroundColor: 'transparent' },
        (pressed || disabled) && { opacity: 0.5 },
      ]}
    >
      {icon && <Icon name={icon} tint={variant === 'primary' ? '#111' : color.text} />}
      <Text style={[styles.buttonText, { color: variant === 'primary' ? '#111' : color.text }]}>
        {label}
      </Text>
    </Pressable>
  );
}
export function Field({
  label,
  value,
  onChange,
  secure = false,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  secure?: boolean;
  multiline?: boolean;
}) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        secureTextEntry={secure}
        autoCapitalize={secure || /mail|usuário|Convite/.test(label) ? 'none' : 'sentences'}
        autoCorrect={!secure}
        multiline={multiline}
        placeholderTextColor={color.muted}
        style={[styles.input, multiline && { minHeight: 90, textAlignVertical: 'top' }]}
      />
    </View>
  );
}
export function Footer() {
  return (
    <View style={styles.footer}>
      <Text style={styles.footerText}>
        LivesRun © {new Date().getFullYear()} · Desenvolvido por{' '}
      </Text>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel="IWETI, site de desenvolvimento"
        onPress={() => void Linking.openURL('https://iweti.com')}
      >
        <Text style={[styles.footerText, { color: color.text }]}>IWETI</Text>
      </Pressable>
    </View>
  );
}
export function Brand() {
  return (
    <View style={styles.row}>
      <View style={styles.brandMark}>
        <Icon name="pulse" size={25} tint="#111" />
      </View>
      <Text style={styles.brand}>
        livesrun<Text style={{ color: color.orange }}>.</Text>
      </Text>
    </View>
  );
}
export function Section({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow?: string;
  children?: React.ReactNode;
}) {
  return (
    <View style={{ gap: 16 }}>
      {eyebrow && <Text style={styles.eyebrow}>{eyebrow}</Text>}
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}
export function Empty({
  icon = 'footsteps-outline',
  title,
  text,
}: {
  icon?: IconName;
  title: string;
  text: string;
}) {
  return (
    <View style={styles.empty}>
      <Icon name={icon} size={32} />
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={[styles.muted, { textAlign: 'center' }]}>{text}</Text>
    </View>
  );
}
export function Stat({ value, label, unit }: { value: string; label: string; unit?: string }) {
  return (
    <View style={{ flex: 1, gap: 6 }}>
      <Text style={styles.stat}>
        {value}
        <Text style={styles.unit}> {unit}</Text>
      </Text>
      <Text style={styles.small}>{label}</Text>
    </View>
  );
}
export function Card({
  activity,
  onOpen,
  onLike,
}: {
  activity: ActivitySummary;
  onOpen: () => void;
  onLike: () => void;
}) {
  return (
    <View style={styles.card}>
      <View style={[styles.row, { justifyContent: 'space-between' }]}>
        <View style={styles.row}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {activity.author.name
                .split(' ')
                .map((s) => s[0])
                .slice(0, 2)
                .join('')}
            </Text>
          </View>
          <View>
            <Text style={styles.name}>{activity.author.name}</Text>
            <Text style={styles.small}>
              {new Date(activity.startedAt).toLocaleDateString('pt-BR', {
                day: 'numeric',
                month: 'short',
              })}{' '}
              · {activity.sport === 'run' ? 'Corrida' : 'Caminhada'}
            </Text>
          </View>
        </View>
        <Icon
          name={activity.visibility === 'private' ? 'lock-closed-outline' : 'people-outline'}
          size={17}
        />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Abrir ${activity.sport === 'run' ? 'corrida' : 'caminhada'} de ${activity.author.name}`}
        onPress={onOpen}
        style={{ gap: 18 }}
      >
        <Text style={styles.cardTitle}>
          {activity.sport === 'run' ? 'Mais um capítulo na corrida' : 'Um tempo para se movimentar'}
        </Text>
        <View style={styles.row}>
          <Stat value={formatDistance(activity.distanceMeters)} unit="km" label="Distância" />
          <Stat value={formatDuration(activity.durationSeconds)} label="Duração" />
          <Stat value={formatPace(activity.paceSecondsPerKm)} label="Ritmo /km" />
        </View>
        {!!activity.caption && <Text style={styles.body}>{activity.caption}</Text>}
      </Pressable>
      <View style={[styles.row, styles.cardActions]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={activity.liked ? 'Retirar incentivo' : 'Incentivar atleta'}
          onPress={onLike}
          style={styles.row}
        >
          <Icon
            name={activity.liked ? 'heart' : 'heart-outline'}
            tint={activity.liked ? color.orange : color.muted}
          />
          <Text style={styles.small}>{activity.likeCount} incentivos</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Abrir comentários"
          onPress={onOpen}
          style={styles.row}
        >
          <Icon name="chatbubble-outline" size={18} />
          <Text style={styles.small}>{activity.commentCount} comentários</Text>
        </Pressable>
      </View>
    </View>
  );
}
