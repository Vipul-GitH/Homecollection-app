import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import LoadingOverlay from '../../components/common/LoadingOverlay';
import {BRAND} from '../../styles/appStyles';

export default function LoginScreen({
  styles,
  contentWidth,
  horizontalPadding,
  loginTopSpacing,
  loginBottomSpacing,
  isSmallPhone,
  username,
  password,
  loginError,
  isLoggingIn,
  loginLoadingMessage,
  locationStatus,
  onUsernameChange,
  onPasswordChange,
  onLogin,
}) {
  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor={BRAND.background} />
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.backgroundOrbTop} />
        <View style={styles.backgroundOrbMiddle} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.flex}>
          <ScrollView
            contentContainerStyle={[
              styles.loginScrollContent,
              {
                paddingHorizontal: horizontalPadding,
                paddingTop: loginTopSpacing,
                paddingBottom: loginBottomSpacing,
              },
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            <View style={[styles.loginContentShell, {maxWidth: contentWidth}]}>
              <View style={styles.header}>
                <View style={styles.heroPill}>
                  <Text style={styles.heroPillText}>Secure Access</Text>
                </View>
                <Text style={styles.eyebrow}>Welcome Back</Text>
                <Text style={[styles.title, isSmallPhone && styles.titleCompact]}>
                  Login to HomeCollection
                </Text>
                <Text style={styles.subtitle}>
                  Access your account to manage collections and saved items.
                </Text>
              </View>

              <View style={[styles.card, isSmallPhone && styles.cardCompact]}>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>User ID</Text>
                  <View style={styles.inputShell}>
                    <Ionicons name="person-circle-outline" size={18} style={styles.inputIcon} />
                    <TextInput
                      placeholder="Enter your user ID"
                      placeholderTextColor={BRAND.textMuted}
                      autoCapitalize="words"
                      style={styles.input}
                      value={username}
                      onChangeText={onUsernameChange}
                      editable={!isLoggingIn}
                    />
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Password</Text>
                  <View style={styles.inputShell}>
                    <Ionicons name="lock-closed-outline" size={18} style={styles.inputIcon} />
                    <TextInput
                      placeholder="Enter your password"
                      placeholderTextColor={BRAND.textMuted}
                      secureTextEntry
                      style={styles.input}
                      value={password}
                      onChangeText={onPasswordChange}
                      editable={!isLoggingIn}
                    />
                  </View>
                </View>

                {loginError ? (
                  <View style={styles.loginErrorBox}>
                    <Text style={styles.loginErrorText}>{loginError}</Text>
                  </View>
                ) : null}

                <TouchableOpacity
                  activeOpacity={0.9}
                  style={styles.loginButton}
                  onPress={onLogin}
                  disabled={isLoggingIn}>
                  <View style={styles.loginButtonGradient}>
                    <Ionicons
                      name={isLoggingIn ? 'hourglass-outline' : 'arrow-forward-circle'}
                      size={18}
                      style={styles.loginButtonIcon}
                    />
                    <Text style={styles.loginButtonText}>
                      {isLoggingIn ? 'Logging in...' : 'Login'}
                    </Text>
                  </View>
                </TouchableOpacity>

                <View style={styles.locationStatusBox}>
                  <Text style={styles.locationStatusTitle}>Startup Location</Text>
                  <Text style={styles.locationStatusText}>{locationStatus}</Text>
                </View>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
        <LoadingOverlay
          styles={styles}
          visible={isLoggingIn}
          title="Signing In"
          message={loginLoadingMessage || 'Verifying your credentials securely...'}
        />
      </SafeAreaView>
    </>
  );
}


