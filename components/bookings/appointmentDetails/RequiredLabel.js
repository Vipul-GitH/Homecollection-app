import React from 'react';
import {Text} from 'react-native';

function RequiredLabel({styles, children}) {
  return (
    <Text style={styles.addPatientFieldLabel}>
      {children}
      <Text style={styles.requiredFieldAsterisk}> *</Text>
    </Text>
  );
}

export default React.memo(RequiredLabel);
