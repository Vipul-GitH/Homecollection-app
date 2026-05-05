import React from 'react';
import {Text, View} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';

function TerminalStatusCard({
  styles,
  isCompleted,
  isCancelled,
  message,
}) {
  if (!message) {
    return null;
  }

  return (
    <View
      style={[
        styles.detailTerminalStatusCard,
        isCancelled && styles.detailTerminalStatusCardCancelled,
      ]}>
      <Ionicons
        name={isCompleted ? 'checkmark-circle' : 'close-circle'}
        size={18}
        style={[
          styles.detailTerminalStatusIcon,
          isCancelled && styles.detailTerminalStatusIconCancelled,
        ]}
      />
      <Text
        style={[
          styles.detailTerminalStatusText,
          isCancelled && styles.detailTerminalStatusTextCancelled,
        ]}>
        {message}
      </Text>
    </View>
  );
}

export default React.memo(TerminalStatusCard);
