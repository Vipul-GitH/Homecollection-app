import React, {useEffect} from 'react';
import {Image, StatusBar, StyleSheet, Text, View} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import {SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';

const logoImage = require('../../../assets/logo.png');

const SPLASH_MIN_DURATION = 2800;
const NAVY = '#0a1628';
const TEAL = '#4db696';

type SplashScreenProps = {
  navigation?: {
    replace?: (screenName: string) => void;
  };
};

const animateIn = (value: SharedValue<number>, delay: number) => {
  value.value = withDelay(
    delay,
    withTiming(1, {
      duration: 600,
      easing: Easing.out(Easing.cubic),
    }),
  );
};

const useFadeUpStyle = (progress: SharedValue<number>) =>
  useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{translateY: (1 - progress.value) * 16}],
  }));

function LoadingDot({delay}: {delay: number}) {
  const translateY = useSharedValue(0);

  useEffect(() => {
    translateY.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(-7, {
            duration: 700,
            easing: Easing.inOut(Easing.ease),
          }),
          withTiming(0, {
            duration: 700,
            easing: Easing.inOut(Easing.ease),
          }),
        ),
        -1,
        false,
      ),
    );
  }, [delay, translateY]);

  const dotStyle = useAnimatedStyle(() => ({
    transform: [{translateY: translateY.value}],
  }));

  return <Animated.View style={[styles.dot, dotStyle]} />;
}

export default function SplashScreen({navigation}: SplashScreenProps) {
  const insets = useSafeAreaInsets();
  const pulseScale = useSharedValue(0.92);
  const logoOpacity = useSharedValue(0);
  const brandProgress = useSharedValue(0);
  const taglineProgress = useSharedValue(0);
  const dividerProgress = useSharedValue(0);
  const loadingProgress = useSharedValue(0);
  const dotsProgress = useSharedValue(0);
  const versionProgress = useSharedValue(0);

  useEffect(() => {
    pulseScale.value = withRepeat(
      withTiming(1.08, {
        duration: 2800,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      true,
    );

    logoOpacity.value = withTiming(1, {
      duration: 500,
      easing: Easing.out(Easing.cubic),
    });
    animateIn(brandProgress, 200);
    animateIn(taglineProgress, 350);
    animateIn(dividerProgress, 450);
    animateIn(loadingProgress, 550);
    animateIn(dotsProgress, 650);
    animateIn(versionProgress, 800);
  }, [
    brandProgress,
    dividerProgress,
    dotsProgress,
    loadingProgress,
    logoOpacity,
    pulseScale,
    taglineProgress,
    versionProgress,
  ]);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = await AsyncStorage.getItem('auth_token');
        await new Promise(resolve => setTimeout(resolve, SPLASH_MIN_DURATION));

        if (token) {
          navigation?.replace?.('Home');
        } else {
          navigation?.replace?.('Login');
        }
      } catch (error) {
        navigation?.replace?.('Login');
      }
    };

    checkAuth();
  }, [navigation]);

  const ringPulseStyle = useAnimatedStyle(() => ({
    transform: [{scale: pulseScale.value}],
  }));
  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
  }));
  const brandStyle = useFadeUpStyle(brandProgress);
  const taglineStyle = useFadeUpStyle(taglineProgress);
  const dividerStyle = useFadeUpStyle(dividerProgress);
  const loadingStyle = useFadeUpStyle(loadingProgress);
  const dotsStyle = useFadeUpStyle(dotsProgress);
  const versionStyle = useFadeUpStyle(versionProgress);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar
        translucent
        barStyle="light-content"
        backgroundColor="transparent"
      />
      <View style={styles.container}>
        <View style={styles.backgroundRingLarge} />
        <View style={styles.backgroundRingSmall} />

        <View style={styles.centerContent}>
          <Animated.View style={[styles.logoRing, ringPulseStyle]}>
            <Animated.View style={logoStyle}>
              <Image source={logoImage} style={styles.logo} resizeMode="contain" />
            </Animated.View>
          </Animated.View>

          <Animated.Text style={[styles.brandName, brandStyle]}>
            <Text style={styles.brandText}>Dr Bhasin's </Text>
            <Text style={styles.brandAccent}>Lab</Text>
          </Animated.Text>

          <Animated.Text style={[styles.tagline, taglineStyle]}>
            TRUSTED QUALITY & SERVICE
          </Animated.Text>

          <Animated.View style={[styles.divider, dividerStyle]} />

          <Animated.Text style={[styles.loadingText, loadingStyle]}>
            Loading your workspace
          </Animated.Text>

          <Animated.View style={[styles.dotsRow, dotsStyle]}>
            <LoadingDot delay={0} />
            <LoadingDot delay={200} />
            <LoadingDot delay={400} />
          </Animated.View>
        </View>

        <Animated.Text
          style={[
            styles.versionText,
            {bottom: insets.bottom + 32},
            versionStyle,
          ]}>
          v1.0.0
        </Animated.Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: NAVY,
  },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: NAVY,
    overflow: 'hidden',
  },
  backgroundRingLarge: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    borderWidth: 1,
    borderColor: 'rgba(77,182,150,0.07)',
    alignSelf: 'center',
  },
  backgroundRingSmall: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 1,
    borderColor: 'rgba(77,182,150,0.05)',
    alignSelf: 'center',
  },
  centerContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoRing: {
    width: 150,
    height: 150,
    borderRadius: 75,
    borderWidth: 1.5,
    borderColor: 'rgba(77,182,150,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 108,
    height: 108,
  },
  brandName: {
    marginTop: 28,
    fontSize: 24,
    lineHeight: 30,
    fontFamily: 'Georgia',
    fontWeight: '400',
  },
  brandText: {
    color: '#ffffff',
    fontSize: 24,
    fontFamily: 'Georgia',
  },
  brandAccent: {
    color: TEAL,
    fontSize: 24,
    fontFamily: 'Georgia',
  },
  tagline: {
    marginTop: 7,
    fontSize: 11,
    lineHeight: 15,
    color: 'rgba(255,255,255,0.38)',
    letterSpacing: 2.2,
    fontFamily: 'sans-serif',
    fontWeight: '400',
  },
  divider: {
    width: 44,
    height: 1,
    marginTop: 24,
    marginBottom: 24,
    alignSelf: 'center',
    backgroundColor: 'rgba(77,182,150,0.35)',
  },
  loadingText: {
    marginBottom: 14,
    fontSize: 12,
    lineHeight: 16,
    color: 'rgba(255,255,255,0.32)',
    letterSpacing: 0.5,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: TEAL,
  },
  versionText: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignSelf: 'center',
    textAlign: 'center',
    fontSize: 11,
    lineHeight: 14,
    color: 'rgba(255,255,255,0.18)',
    letterSpacing: 1,
  },
});
