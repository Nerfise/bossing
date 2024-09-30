import React, { useState, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { Avatar, Input, Button } from 'react-native-elements';
import { FontAwesome } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { getAuth, updateProfile, onAuthStateChanged, signOut } from 'firebase/auth';
import { getFirestore, doc, setDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { useNavigation } from '@react-navigation/native';

const ProfileScreen = () => {
  const navigation = useNavigation();
  const auth = getAuth();
  const firestore = getFirestore();
  const storage = getStorage();
  
  const [user, setUser] = useState(auth.currentUser);
  const [displayName, setDisplayName] = useState('');
  const [profilePhoto, setProfilePhoto] = useState(null);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [points, setPoints] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (authUser) => {
      if (authUser) {
        setUser(authUser);
      } else {
        setUser(null);
      }
    });
    return () => unsubscribe();
  }, [auth]);

  useEffect(() => {
    if (user) {
      const userDocRef = doc(firestore, 'users', user.uid);
      
      const unsubscribe = onSnapshot(userDocRef, (doc) => {
        const userData = doc.data();
        if (userData) {
          setDisplayName(userData.displayName || '');
          setProfilePhoto(userData.photoURL || '');
          setEmail(userData.email || user.email || '');
          setPhone(userData.phone || '');
          setAddress(userData.address || '');
          setPoints(userData.points || 0);
        }
      });

      return () => unsubscribe(); // Clean up listener on unmount
    }
  }, [user]);

  const handleProfileUpdate = async () => {
    setLoading(true);
    try {
      let downloadURL = profilePhoto;

      if (profilePhoto && profilePhoto.startsWith('file:')) {
        const response = await fetch(profilePhoto);
        const blob = await response.blob();
        const storageRef = ref(storage, `profile_photos/${user.uid}`);
        const uploadTask = uploadBytesResumable(storageRef, blob);

        await uploadTask;
        downloadURL = await getDownloadURL(storageRef);
      }

      await updateProfile(auth.currentUser, {
        displayName,
        photoURL: downloadURL || auth.currentUser.photoURL,
      });

      const userDocRef = doc(firestore, 'users', user.uid);
      await setDoc(userDocRef, {
        displayName,
        photoURL: downloadURL || auth.currentUser.photoURL,
        email,
        phone,
        address,
        points,
      }, { merge: true }); // Use merge to only update fields that have changed

      setIsEditing(false);
      Alert.alert('Profile Updated', 'Your profile has been successfully updated.');
    } catch (error) {
      console.error('Error updating profile:', error);
      Alert.alert('Error', 'There was an issue updating your profile.');
    } finally {
      setLoading(false);
    }
  };

  const handlePurchasePoints = async (purchaseAmount) => {
    if (purchaseAmount >= 5000) {
      const newPoints = points + Math.floor(purchaseAmount / 5000);
      try {
        const userDocRef = doc(firestore, 'users', user.uid);
        await updateDoc(userDocRef, { points: newPoints });
        Alert.alert('Points Added', `You've earned ${Math.floor(purchaseAmount / 5000)} points! Your total points: ${newPoints}`);
      } catch (error) {
        console.error('Error updating points:', error);
        Alert.alert('Error', 'There was an issue adding points.');
      }
    }
  };

  const handleRedeemPoints = async () => {
    if (points < 5) {
      Alert.alert('Not Enough Points', 'You need at least 5 points to redeem.');
      return;
    }
    const newPoints = points - 5;
    try {
      const userDocRef = doc(firestore, 'users', user.uid);
      await updateDoc(userDocRef, { points: newPoints });
      Alert.alert('Points Redeemed', 'You have successfully redeemed 5 points!');
    } catch (error) {
      console.error('Error redeeming points:', error);
      Alert.alert('Error', 'There was an issue redeeming your points.');
    }
  };

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
      });

      if (!result.canceled) {
        setProfilePhoto(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error picking an image:', error);
    }
  };

  const confirmLogout = () => {
    Alert.alert(
      'Logout Confirmation',
      'Are you sure you want to log out?',
      [
        {
          text: 'No',
          onPress: () => console.log('Logout Cancelled'),
          style: 'cancel',
        },
        {
          text: 'Yes',
          onPress: handleLogout,
        },
      ]
    );
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      Alert.alert('Logged Out', 'You have been successfully logged out.');
      navigation.navigate('WelcomeScreen');
    } catch (error) {
      console.error('Error signing out:', error);
      Alert.alert('Error', 'There was an issue signing out.');
    }
  };

  const handleViewHistory = () => {
    navigation.navigate('HistoryScreen', { points });
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <TouchableOpacity onPress={confirmLogout} style={styles.logoutButtonContainer}>
        <FontAwesome name="sign-out" size={24} color="#dc3545" />
        <Text style={styles.logoutButtonText}>Logout</Text>
      </TouchableOpacity>
      <View style={styles.profileContainer}>
        <TouchableOpacity onPress={pickImage}>
          <Avatar
            size="xlarge"
            rounded
            source={profilePhoto ? { uri: profilePhoto } : undefined}
            showEditButton
            editButton={{
              name: 'edit',
              type: 'font-awesome',
              size: 20,
              color: 'white',
              underlayColor: '#007bff',
            }}
            containerStyle={styles.avatar}
          />
        </TouchableOpacity>
        <Input
          label="Display Name"
          value={displayName}
          onChangeText={setDisplayName}
          containerStyle={styles.inputContainer}
          inputContainerStyle={styles.inputInnerContainer}
          labelStyle={styles.inputLabel}
          disabled={!isEditing}
        />
        <Input
          label="Email"
          value={email}
          onChangeText={setEmail}
          containerStyle={styles.inputContainer}
          inputContainerStyle={styles.inputInnerContainer}
          labelStyle={styles.inputLabel}
          disabled={!isEditing}
        />
        <Input
          label="Phone"
          value={phone}
          onChangeText={setPhone}
          containerStyle={styles.inputContainer}
          inputContainerStyle={styles.inputInnerContainer}
          labelStyle={styles.inputLabel}
          disabled={!isEditing}
        />
        <Input
          label="Address"
          value={address}
          onChangeText={setAddress}
          containerStyle={styles.inputContainer}
          inputContainerStyle={styles.inputInnerContainer}
          labelStyle={styles.inputLabel}
          disabled={!isEditing}
        />
        <Text style={styles.pointsText}>Points: {points}</Text>
        {isEditing ? (
          <>
            <Button
              title={loading ? "Saving..." : "Save Changes"}
              onPress={handleProfileUpdate}
              buttonStyle={styles.saveButton}
              disabled={loading}
              loading={loading}
            />
            <Button
              title="Cancel"
              onPress={() => setIsEditing(false)}
              buttonStyle={styles.cancelButton}
            />
          </>
        ) : (
          <Button
            title="Edit Profile"
            onPress={() => setIsEditing(true)}
            buttonStyle={styles.editButton}
          />
        )}
        
        <Button
          title="View History"
          onPress={handleViewHistory}
          buttonStyle={styles.historyButton}
        />
        <Button
          title="Purchase Points"
          onPress={() => handlePurchasePoints(5000)} // Example amount
          buttonStyle={styles.purchaseButton}
        />
        <Button
          title="Redeem Points"
          onPress={handleRedeemPoints}
          buttonStyle={styles.redeemButton}
        />
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#f5f5f5',
    padding: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileContainer: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 5,
    width: '100%',
    maxWidth: 400,
  },
  avatar: {
    alignSelf: 'center',
    marginBottom: 20,
  },
  inputContainer: {
    marginBottom: 10,
  },
  inputInnerContainer: {
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  inputLabel: {
    color: '#333',
    fontSize: 14,
  },
  pointsText: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  saveButton: {
    backgroundColor: '#007bff',
    marginBottom: 10,
  },
  cancelButton: {
    backgroundColor: '#6c757d',
    marginBottom: 10,
  },
  editButton: {
    backgroundColor: '#28a745',
    marginBottom: 10,
  },
  historyButton: {
    backgroundColor: '#007bff',
    marginTop: 10,
  },
  logoutButtonContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  logoutButtonText: {
    fontSize: 18,
    color: '#dc3545',
    marginLeft: 10,
  },
});

export default ProfileScreen;