import React, {useEffect, useMemo, useRef} from 'react';
import {ActivityIndicator, Animated, Easing, Text, View} from 'react-native';
import {BRAND} from '../../styles/appStyles';

export default function LoadingOverlay({
  styles,
  visible,
  title = 'Please wait',
  message = 'Loading data...',
}) {
  const pulseValue = useRef(new Animated.Value(1)).current;
  const dotValues = useMemo(
    () => [
      new Animated.Value(0.35),
      new Animated.Value(0.35),
      new Animated.Value(0.35),
    ],
    [],
  );

  useEffect(() => {
    if (!visible) {
      pulseValue.stopAnimation();
      dotValues.forEach(dot => dot.stopAnimation());
      pulseValue.setValue(1);
      dotValues.forEach(dot => dot.setValue(0.35));
      return undefined;
    }

    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseValue, {
          toValue: 1.06,
          duration: 650,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseValue, {
          toValue: 1,
          duration: 650,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );

    const dotAnimations = dotValues.map((dotValue, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(index * 120),
          Animated.timing(dotValue, {
            toValue: 1,
            duration: 260,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(dotValue, {
            toValue: 0.35,
            duration: 260,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.delay(120),
        ]),
      ),
    );

    pulseAnimation.start();
    dotAnimations.forEach(animation => animation.start());

    return () => {
      pulseAnimation.stop();
      dotAnimations.forEach(animation => animation.stop());
    };
  }, [dotValues, pulseValue, visible]);

  if (!visible) {
    return null;
  }

  return (
    <View style={styles.loadingOverlay}>
      <View style={styles.loadingCard}>
        <Animated.View
          style={[
            styles.loadingSpinnerWrap,
            {transform: [{scale: pulseValue}]},
          ]}>
          <ActivityIndicator size="large" color={BRAND.primary} />
        </Animated.View>
        <Text style={styles.loadingTitle}>{title}</Text>
        {message ? (
          <Text style={styles.loadingMessage}>{message}</Text>
        ) : null}
        <View style={styles.loadingDotsRow}>
          {dotValues.map((dotValue, index) => (
            <Animated.View
              key={`loading-dot-${index}`}
              style={[
                styles.loadingDot,
                {
                  opacity: dotValue,
                  transform: [
                    {
                      scale: dotValue.interpolate({
                        inputRange: [0.35, 1],
                        outputRange: [0.9, 1.08],
                      }),
                    },
                  ],
                },
              ]}
            />
          ))}
        </View>
      </View>
    </View>
  );
}


