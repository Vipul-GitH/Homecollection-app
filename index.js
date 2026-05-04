/**
 * @format
 */

import 'react-native-gesture-handler';
import {AppRegistry, StyleSheet} from 'react-native';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import App from './App';
import {name as appName} from './app.json';

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});

function Root() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <App />
    </GestureHandlerRootView>
  );
}

AppRegistry.registerComponent(appName, () => Root);
