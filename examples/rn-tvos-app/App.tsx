import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

type Movie = { id: string; title: string; year: number; color: string };

const MOVIES: Movie[] = [
  { id: '1', title: 'Inception', year: 2010, color: '#1f3a5f' },
  { id: '2', title: 'Interstellar', year: 2014, color: '#2c3e50' },
  { id: '3', title: 'The Dark Knight', year: 2008, color: '#0b0b0b' },
  { id: '4', title: 'Dune', year: 2021, color: '#9c6b3c' },
  { id: '5', title: 'Blade Runner 2049', year: 2017, color: '#7a3e2a' },
  { id: '6', title: 'Arrival', year: 2016, color: '#3a4f3a' },
  { id: '7', title: 'Tenet', year: 2020, color: '#2a3a4a' },
  { id: '8', title: 'Oppenheimer', year: 2023, color: '#5a2a2a' },
];

const ACCENT = '#4fc3f7';

function MovieCard({ movie, hasInitialFocus }: { movie: Movie; hasInitialFocus: boolean }) {
  const [focused, setFocused] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: focused ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [focused, progress]);

  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] });
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [0, -12] });
  const borderColor = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(255,255,255,0.06)', ACCENT],
  });
  const cardOpacity = progress.interpolate({ inputRange: [0, 1], outputRange: [0.75, 1] });
  const shadowOpacity = progress.interpolate({ inputRange: [0, 1], outputRange: [0, 0.9] });
  const shadowRadius = progress.interpolate({ inputRange: [0, 1], outputRange: [0, 28] });
  const elevation = progress.interpolate({ inputRange: [0, 1], outputRange: [0, 22] });

  return (
    <Animated.View
      style={{
        transform: [{ scale }, { translateY }],
        opacity: cardOpacity,
        shadowColor: ACCENT,
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity,
        shadowRadius,
        elevation,
      }}
    >
      <Pressable
        focusable
        hasTVPreferredFocus={hasInitialFocus}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      >
        <Animated.View style={[styles.card, { borderColor }]}>
          <View style={[styles.poster, { backgroundColor: movie.color }]}>
            <Text style={styles.posterTitle}>{movie.title}</Text>
          </View>
          <View style={styles.meta}>
            <Text style={styles.title} numberOfLines={1}>
              {movie.title}
            </Text>
            <Text style={styles.year}>{movie.year}</Text>
          </View>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Movies</Text>
      <FlatList
        data={MOVIES}
        keyExtractor={(m) => m.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        renderItem={({ item, index }) => (
          <MovieCard movie={item} hasInitialFocus={index === 0} />
        )}
      />
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    paddingTop: 60,
  },
  heading: {
    color: '#ffd60a',
    fontSize: 32,
    fontWeight: '700',
    paddingHorizontal: 60,
    marginBottom: 24,
  },
  row: {
    paddingHorizontal: 60,
    paddingVertical: 48,
    gap: 28,
  },
  card: {
    width: 200,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#181818',
    borderWidth: 3,
  },
  poster: {
    height: 280,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
  },
  posterTitle: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  meta: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  title: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  year: {
    color: '#9aa0a6',
    fontSize: 13,
    marginTop: 2,
  },
});
