import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  Easing,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

type Movie = { id: string; title: string; year: number; color: string; synopsis: string };

const MOVIES: Movie[] = [
  {
    id: '1',
    title: 'Inception',
    year: 2010,
    color: '#1f3a5f',
    synopsis:
      'A skilled thief enters dreams to steal secrets. His next assignment asks him to plant an idea instead.',
  },
  {
    id: '2',
    title: 'Interstellar',
    year: 2014,
    color: '#2c3e50',
    synopsis:
      'A team of explorers travels beyond our solar system in search of a new home for humanity.',
  },
  {
    id: '3',
    title: 'The Dark Knight',
    year: 2008,
    color: '#0b0b0b',
    synopsis:
      'Batman faces a criminal who turns Gotham into a test of trust, courage, and chaos.',
  },
  {
    id: '4',
    title: 'Dune',
    year: 2021,
    color: '#9c6b3c',
    synopsis:
      'A young heir arrives on a desert planet where rival powers compete for its precious resources.',
  },
  {
    id: '5',
    title: 'Blade Runner 2049',
    year: 2017,
    color: '#7a3e2a',
    synopsis:
      'A discovery sends a replicant investigator searching for a missing blade runner and his own origins.',
  },
  {
    id: '6',
    title: 'Arrival',
    year: 2016,
    color: '#3a4f3a',
    synopsis:
      'A linguist tries to communicate with mysterious visitors as the world struggles to understand their arrival.',
  },
  {
    id: '7',
    title: 'Tenet',
    year: 2020,
    color: '#2a3a4a',
    synopsis:
      'An operative follows a trail of inverted time to prevent a catastrophe that threatens the future.',
  },
  {
    id: '8',
    title: 'Oppenheimer',
    year: 2023,
    color: '#5a2a2a',
    synopsis:
      'A physicist leads the effort to build the atomic bomb and confronts the consequences of that achievement.',
  },
];

const ACCENT = '#4fc3f7';

function MovieCard({
  movie,
  hasInitialFocus,
  onSelect,
}: {
  movie: Movie;
  hasInitialFocus: boolean;
  onSelect: (movie: Movie) => void;
}) {
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
  const cardOpacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.75, 1],
  });
  const shadowOpacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.9],
  });
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
        testID={movie.title}
        accessibilityLabel={movie.title}
        accessibilityRole="button"
        onPress={() => onSelect(movie)}
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

function MovieDetail({ movie, onBack }: { movie: Movie; onBack: () => void }) {
  const [backFocused, setBackFocused] = useState(false);

  return (
    <View style={styles.detail} testID="movie-detail">
      <View style={[styles.detailPoster, { backgroundColor: movie.color }]}>
        <Text style={styles.posterTitle}>{movie.title}</Text>
      </View>
      <View style={styles.detailContent}>
        <Text style={styles.detailEyebrow}>MOVIE DETAILS</Text>
        <Text style={styles.detailTitle} accessibilityRole="header">
          {movie.title}
        </Text>
        <Text style={styles.detailYear}>{movie.year}</Text>
        <Text style={styles.synopsis}>{movie.synopsis}</Text>
        <Pressable
          focusable
          hasTVPreferredFocus
          accessibilityRole="button"
          accessibilityLabel="Back to movies"
          testID="back-to-movies"
          onPress={onBack}
          onFocus={() => setBackFocused(true)}
          onBlur={() => setBackFocused(false)}
          style={[styles.backButton, backFocused && styles.backButtonFocused]}
        >
          <Text style={[styles.backLabel, backFocused && styles.backLabelFocused]}>
            Back to movies
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function App() {
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [lastSelectedId, setLastSelectedId] = useState(MOVIES[0].id);

  useEffect(() => {
    if (!selectedMovie) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setSelectedMovie(null);
      return true;
    });
    return () => subscription.remove();
  }, [selectedMovie]);

  return (
    <View style={styles.container}>
      {selectedMovie ? (
        <MovieDetail movie={selectedMovie} onBack={() => setSelectedMovie(null)} />
      ) : (
        <>
          <Text style={styles.heading}>Movies</Text>
          <FlatList
            data={MOVIES}
            keyExtractor={(m) => m.id}
            horizontal
            initialScrollIndex={MOVIES.findIndex((movie) => movie.id === lastSelectedId)}
            getItemLayout={(_, index) => ({
              length: 228,
              offset: 60 + 228 * index,
              index,
            })}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.row}
            renderItem={({ item }) => (
              <MovieCard
                movie={item}
                hasInitialFocus={item.id === lastSelectedId}
                onSelect={(movie) => {
                  setLastSelectedId(movie.id);
                  setSelectedMovie(movie);
                }}
              />
            )}
          />
        </>
      )}
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
  detail: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 48,
    paddingHorizontal: 60,
    paddingBottom: 60,
  },
  detailPoster: {
    width: 200,
    height: 280,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  detailContent: { flex: 1, gap: 14 },
  detailEyebrow: { color: ACCENT, fontSize: 13, fontWeight: '700', letterSpacing: 2 },
  detailTitle: { color: '#fff', fontSize: 36, fontWeight: '700' },
  detailYear: { color: '#9aa0a6', fontSize: 18 },
  synopsis: { color: '#d6d9df', fontSize: 18, lineHeight: 27 },
  backButton: {
    alignSelf: 'flex-start',
    marginTop: 12,
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: '#454545',
    backgroundColor: '#181818',
  },
  backButtonFocused: { borderColor: ACCENT, backgroundColor: ACCENT },
  backLabel: { color: '#fff', fontSize: 16, fontWeight: '700' },
  backLabelFocused: { color: '#0a0a0a' },
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
