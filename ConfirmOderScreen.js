import React, { useState, useEffect, useContext } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, TextInput, Button, FlatList, ActivityIndicator, Image, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { firestore, auth } from '../config/firebase';
import { doc, getDoc, updateDoc, setDoc, collection } from 'firebase/firestore';
import { CartContext } from '../context/CartContext';
import { useNavigation } from '@react-navigation/native';
import axios from 'axios'; // Import axios for HTTP requests
import { products } from './data'; // Ensure this path is correct
import { btoa } from 'base-64';

// Helper function to find a product by ID
const getProductById = (id) => {
  return products.find(product => product.id === id) || {};
};

const OrderScreen = () => {
  const navigation = useNavigation();
  const { cartItems, clearCart } = useContext(CartContext);

  const [addresses, setAddresses] = useState([]);
  const [selectedAddress, setSelectedAddress] = useState(null);
  const [newAddress, setNewAddress] = useState('');
  const [step, setStep] = useState(1);
  const [deliveryMethod, setDeliveryMethod] = useState('Cash on Delivery');
  const [loading, setLoading] = useState(false);
  const [showAddAddress, setShowAddAddress] = useState(false);
  const [editAddressId, setEditAddressId] = useState(null);

  const userId = auth.currentUser?.uid;

  const fetchAddresses = async () => {
    if (!userId) {
      console.log("User ID is not defined.");
      Alert.alert("Error", "User ID is not available.");
      return;
    }

    try {
      const docRef = doc(firestore, 'users', userId);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const userAddresses = docSnap.data()?.addresses || [];
        setAddresses(userAddresses);
        if (userAddresses.length > 0) {
          setSelectedAddress(userAddresses[0]?.id || null);
        } else {
          console.log("No addresses found for this user.");
          Alert.alert("No Document", "No addresses found for this user.");
        }
      } else {
        console.log("No such document!");
        Alert.alert("No Document", "No addresses found for this user.");
      }
    } catch (error) {
      console.error("Error fetching addresses: ", error);
      Alert.alert("Error", `Error fetching addresses: ${error.message}`);
    }
  };

  useEffect(() => {
    fetchAddresses();
  }, [userId]);

  const handleAddAddress = async () => {
    if (!newAddress) {
      Alert.alert("Address Required", "Please enter an address.");
      return;
    }

    try {
      if (!userId) {
        console.log("User ID is not defined.");
        Alert.alert("Error", "User ID is not available.");
        return;
      }

      const userRef = doc(firestore, 'users', userId);
      const userDocSnap = await getDoc(userRef);
      const existingAddresses = userDocSnap.data()?.addresses || [];

      if (editAddressId) {
        // Edit address
        const updatedAddresses = existingAddresses.map(addr =>
          addr.id === editAddressId ? { id: editAddressId, address: newAddress } : addr
        );

        await updateDoc(userRef, { addresses: updatedAddresses });
        setAddresses(updatedAddresses);
        setEditAddressId(null);
        Alert.alert("Address Updated", "Your address has been updated successfully!");
      } else {
        // Add new address
        const newAddressId = Date.now().toString();
        await updateDoc(userRef, {
          addresses: [...existingAddresses, { id: newAddressId, address: newAddress }],
        });

        setAddresses([...existingAddresses, { id: newAddressId, address: newAddress }]);
        Alert.alert("Address Added", "Your address has been added successfully!");
      }

      setNewAddress('');
      setShowAddAddress(false);
    } catch (error) {
      console.error("Error saving address: ", error);
      Alert.alert("Error", "There was an issue saving your address. Please try again.");
    }
  };

  const handleEditAddress = (address) => {
    setEditAddressId(address.id);
    setNewAddress(address.address);
    setShowAddAddress(true);
  };

  const handleRemoveAddress = async (addressId) => {
    try {
      if (!userId) {
        console.log("User ID is not defined.");
        Alert.alert("Error", "User ID is not available.");
        return;
      }

      const userRef = doc(firestore, 'users', userId);
      const userDocSnap = await getDoc(userRef);
      const existingAddresses = userDocSnap.data()?.addresses || [];
      const updatedAddresses = existingAddresses.filter(addr => addr.id !== addressId);

      await updateDoc(userRef, { addresses: updatedAddresses });
      setAddresses(updatedAddresses);
      if (selectedAddress === addressId) {
        setSelectedAddress(null);
      }
      Alert.alert("Address Removed", "Your address has been removed successfully!");
    } catch (error) {
      console.error("Error removing address: ", error);
      Alert.alert("Error", "There was an issue removing your address. Please try again.");
    }
  };

  const handlePlaceOrder = async () => {
    if (!selectedAddress) {
      Alert.alert("Address Missing", "Please select an address before placing your order.");
      return;
    }
  
    if (cartItems.length === 0) {
      Alert.alert("Cart Empty", "Your cart is empty. Please add items to your cart before placing an order.");
      return;
    }
  
    Alert.alert(
      "Confirm Order",
      "Are you sure you want to place this order?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "OK", onPress: async () => {
            setLoading(true);
  
            // Fetch the user's profile to get the username
            let userName;
            try {
              const userRef = doc(firestore, 'users', userId);
              const userSnap = await getDoc(userRef);
              if (userSnap.exists()) {
                userName = userSnap.data().displayName; // Ensure correct field name
                if (!userName) {
                  throw new Error("User name not found");
                }
              } else {
                throw new Error("User document does not exist");
              }
            } catch (error) {
              console.error("Error fetching user profile: ", error);
              Alert.alert("Error", "There was an issue fetching the user profile. Please try again.");
              setLoading(false);
              return;
            }
  
            const formattedItems = cartItems.map(item => {
              const product = getProductById(item.id);
              if (!product) {
                console.log(`Product with ID ${item.id} not found.`);
              }
              return {
                id: item.id,
                name: product.name || 'Unknown Product',
                description: product.description || 'No Description',
                quantity: item.quantity,
                price: product.price || 'N/A',
              };
            });
  
            const orderDetails = {
              items: formattedItems,
              total: calculateTotalPrice(),
              delivery: deliveryMethod,
              address: addresses.find(addr => addr.id === selectedAddress)?.address,
              paymentMethod: deliveryMethod,
              userId: userId,
              userName: userName,
              createdAt: new Date(),
              status: 'Pending',
            };
  
            console.log("Order Details:", orderDetails);
  
            try {
              const orderRef = doc(collection(firestore, 'orders'));
              await setDoc(orderRef, orderDetails);
  
              const totalPrice = parseFloat(calculateTotalPrice());
              const pointsToAdd = Math.floor(totalPrice / 5000);
  
              if (pointsToAdd > 0) {
                const userRef = doc(firestore, 'users', userId);
                const userDoc = await getDoc(userRef);
                if (userDoc.exists()) {
                  const userData = userDoc.data();
                  const currentPoints = userData.points || 0;
                  await updateDoc(userRef, { points: currentPoints + pointsToAdd });
                }
              }
  
              // Create the payment request here
              const publicKey = 'pk_test_aEr3enbHMEoebhxdF66uqWFp'; // Replace with your PayMongo Public Key
              const secretKey = 'sk_test_S2PQ6b8SM5ueaA6VNKLXLYhh'; 
  
              try {
                const options = {
                  method: 'POST',
                  headers: {
                    accept: 'application/json',
                    'content-type': 'application/json',
                    authorization: 'Basic c2tfdGVzdF9DMWhyemR2dmJ5eTlWYW80UXNzbXdBYTQ6'
                  },
                  body: JSON.stringify({data: {attributes: {amount: 100000, description: 'elorde', remarks: 'item'}}})
                };
                
                fetch('https://api.paymongo.com/v1/links', options)
                  .then(response => response.json())
                  .then(response => console.log(response))
                  .catch(err => console.error(err));
  
                // Navigate to PaymentView and pass the checkout URL
                if (response.data && response.data.pisopay_checkout_url) {
                  navigation.navigate('HomeScreen', {
                    pisopay_checkout_url: response.data.pisopay_checkout_url,
                  });
                } else {
                  Alert.alert('Payment Error', 'Checkout URL not available.');
                }
              } catch (error) {
                console.error('Error creating payment intent:', error);
                Alert.alert('Payment Error', 'There was an issue with your payment. Please try again.');
              }
  
              Alert.alert('Order Successful', 'Your order has been placed successfully!');
              clearCart();
              setLoading(false);
              navigation.navigate('HomeScreen');
            } catch (error) {
              console.error('Error placing order:', error);
              Alert.alert('Error', 'There was an issue placing your order. Please try again.');
              setLoading(false);
            }
          }
        }
      ]
    );
  };
  
  // Function to calculate total price
  const calculateTotalPrice = () => {
    return cartItems.reduce((acc, item) => {
      const product = getProductById(item.id);
      return acc + product.price * item.quantity;
    }, 0).toFixed(2);
  };

  const renderStepContent = () => {
    switch (step) {
      case 1:
        return (
          <View style={styles.stepContent}>
            <Text style={styles.addressHeader}>Select Address:</Text>

            {/* List of Addresses */}
            <FlatList
              data={addresses}
              keyExtractor={(item) => item.id.toString()}
              renderItem={({ item }) => (
                <View style={styles.addressItemContainer}>
                  <TouchableOpacity
                    style={[
                      styles.addressItem,
                      item.id === selectedAddress && styles.selectedAddress,
                    ]}
                    onPress={() => setSelectedAddress(item.id)}
                  >
                    <View style={[
                      styles.circle,
                      item.id === selectedAddress ? styles.circleSelected : styles.circleUnselected
                    ]} />
                    <Text style={styles.addressText}>{item.address}</Text>
                  </TouchableOpacity>

                  {/* Deliver to this address button */}
                  {item.id === selectedAddress && (
                    <TouchableOpacity onPress={() => setStep(2)} style={styles.deliverButton}>
                      <Text style={styles.deliverButtonText}>Deliver to this address</Text>
                    </TouchableOpacity>
                  )}

                  {/* Edit Address Button */}
                  <TouchableOpacity onPress={() => handleEditAddress(item)} style={styles.editButton}>
                    <Ionicons name="pencil" size={24} color="black" />
                  </TouchableOpacity>

                  {/* Remove Address Button */}
                  <TouchableOpacity onPress={() => handleRemoveAddress(item.id)} style={styles.removeButton}>
                    <Ionicons name="trash" size={24} color="red" />
                  </TouchableOpacity>
                </View>
              )}
              ListEmptyComponent={<Text style={styles.noAddressText}>No addresses available</Text>}
            />

            {/* Add/Edit Address Modal */}
            {showAddAddress && (
              <View style={styles.modalContainer}>
                <TextInput
                  style={styles.addressInput}
                  placeholder="Enter address"
                  value={newAddress}
                  onChangeText={setNewAddress}
                />
                <Button title={editAddressId ? "Update Address" : "Add Address"} onPress={handleAddAddress} />
                <Button title="Cancel" onPress={() => setShowAddAddress(false)} color="red" />
              </View>
            )}

            <TouchableOpacity onPress={() => setShowAddAddress(true)} style={styles.addAddressButton}>
              <Text style={styles.addAddressButtonText}>+ Add Address</Text>
            </TouchableOpacity>
          </View>
        );

        case 2:
          return (
            <View style={styles.stepContent}>
              <Text style={styles.deliveryHeader}>Select Delivery Method:</Text>
        
              {/* Cash on Delivery Option */}
              <TouchableOpacity 
                onPress={() => setDeliveryMethod('Cash on Delivery')} 
                style={styles.deliveryOption}>
                <View style={[
                  styles.circle,
                  deliveryMethod === 'Cash on Delivery' ? styles.circleSelected : styles.circleUnselected
                ]} />
                <View style={styles.codLogoContainer}>
                  <Image 
                    source={require('../assets/cod.png')} 
                    style={styles.gcashLogo} 
                    resizeMode="contain"/>
                </View>
                <Text style={styles.deliveryOptionText}>Cash on Delivery</Text>
              </TouchableOpacity>
        
              {/* E-Wallet (Gcash) Option */}
              <TouchableOpacity 
                onPress={() => setDeliveryMethod('E-Wallet (Gcash)')} 
                style={styles.deliveryOption}>
                <View style={styles.iconTextContainer}>
                  <View style={[
                    styles.circle,
                    deliveryMethod === 'E-Wallet (Gcash)' ? styles.circleSelected : styles.circleUnselected
                  ]} />
                  <View style={styles.gcashLogoContainer}>
                    <Image 
                      source={require('../assets/gcashlogo.png')} 
                      style={styles.gcashLogo} 
                      resizeMode="contain"/>
                  </View>
                  <Text style={styles.deliveryOptionText}>E-Wallet (GCash)</Text>
                </View>
              </TouchableOpacity>
        
              {/* Points Option */}
              <TouchableOpacity 
                onPress={() => setDeliveryMethod('Points')} 
                style={styles.deliveryOption}>
                <View style={styles.iconTextContainer}>
                  <View style={[
                    styles.circle,
                    deliveryMethod === 'Points' ? styles.circleSelected : styles.circleUnselected
                  ]} />
                  <View style={styles.gcashLogoContainer}>
                    <Image 
                      source={require('../assets/points.webp.png')} 
                      style={styles.gcashLogo} 
                      resizeMode="contain"/>
                  </View>
                  <Text style={styles.deliveryOptionText}>Points</Text>
                </View>
              </TouchableOpacity>
        
              {/* Next Button */}
              <TouchableOpacity 
                onPress={() => {
                  if (deliveryMethod === 'E-Wallet (Gcash)') {
                    // Show confirmation alert if E-Wallet is selected
                    Alert.alert(
                      "Confirm Payment",
                      "Are you sure you want to proceed with E-Wallet (GCash)?",
                      [
                        {
                          text: "Cancel",
                          style: "cancel"
                        },
                        {
                          text: "Yes",
                          onPress: () => {
                            // Redirect to your payment link using PayMongo API
                            const encodedKey = btoa(`${secretKey}:`);
        
                            fetch('https://api.paymongo.com/v1/links', {
                              method: 'POST',
                              headers: {
                                'Authorization': `Basic ${encodedKey}`,
                                'Content-Type': 'application/json',
                              },
                              body: JSON.stringify({
                                amount: 10000, // Amount in centavos (100.00 PHP)
                                currency: 'PHP',
                                description: 'Payment for order #1234',
                                redirect: {
                                  success: 'https://your-success-url.com',
                                  failed: 'https://your-failed-url.com'
                                }
                              })
                            })
                            .then(response => response.json())
                            .then(data => {
                              if (data.errors) {
                                // Handle any errors returned from the API
                                Alert.alert("Payment Error", data.errors[0].detail);
                              } else {
                                // Redirect to the PayMongo payment link
                                Linking.openURL(data.data.attributes.checkout_url);
                              }
                            })
                            .catch(error => {
                              console.error('Error:', error);
                              Alert.alert("Error", "Failed to initiate payment.");
                            });
                          }
                        }
                      ]
                    );
                  } else {
                    // If not E-Wallet, proceed directly to the next step
                    setStep(3);
                  }
                }} 
                style={styles.nextButton}>
                <Text style={styles.buttonText}>Next</Text>
              </TouchableOpacity>
            </View>
          );
        case 3:
            return (
              <View style={styles.stepContent}>
                <Text style={styles.paymentHeader}>Review and Confirm Order:</Text>
                <Text style={styles.reviewText}>Total Price: Php {calculateTotalPrice()}</Text>
                <Text style={styles.reviewText}>Delivery Method: {deliveryMethod}</Text>
                <Text style={styles.reviewText}>Address: {addresses.find(addr => addr.id === selectedAddress)?.address}</Text>
                <Text style={styles.reviewText}>Products:</Text>
                <FlatList
                  data={cartItems}
                  keyExtractor={(item) => item.id.toString()}
                  renderItem={({ item }) => {
                    const product = getProductById(item.id);
                    const productTotal = (parseFloat(product.price.replace('Php', '').replace(',', '')) || 0) * item.quantity;
          
                    return (
                      <View style={styles.productItem}>
                        <Image source={product.image} style={styles.productImage} />
                        <View style={styles.productDetailsContainer}>
                          <Text style={styles.productName}>{product.name || 'Unknown Product'}</Text>
                          <Text style={styles.productDetails}>Quantity: {item.quantity}</Text>
                          <Text style={styles.productDetails}>Price: {product.price || 'N/A'}</Text>
                          <Text style={styles.productDetails}>Total: Php {productTotal.toFixed(2)}</Text>
                        </View>
                      </View>
                    );
                  }}
                />
                <TouchableOpacity onPress={handlePlaceOrder} style={styles.placeOrderButton}>
                  {loading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.buttonText}>Confirm Order</Text>}
                </TouchableOpacity>
              </View>
            );
          
      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
        <Ionicons name="arrow-back" size={24} color="black" />
      </TouchableOpacity>

      <View style={styles.stepper}>
        <View style={styles.step}>
          <Ionicons name="checkmark-circle" size={24} color={step >= 1 ? 'green' : 'gray'} />
          <Text style={styles.stepText}>Address</Text>
        </View>
        <View style={styles.step}>
          <Ionicons name="checkmark-circle" size={24} color={step >= 2 ? 'green' : 'gray'} />
          <Text style={styles.stepText}>Delivery</Text>
        </View>
        <View style={styles.step}>
          <Ionicons name="checkmark-circle" size={24} color={step >= 3 ? 'green' : 'gray'} />
          <Text style={styles.stepText}>Payment</Text>
        </View>
      </View>

      {renderStepContent()}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff',
  },
  backButton: {
    padding: 16,
  },
  stepper: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 16,
    backgroundColor: '#f5f5f5',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  step: {
    alignItems: 'center',
  },
  stepText: {
    marginTop: 4,
    fontSize: 12,
    color: 'gray',
  },
  stepContent: {
    flex: 1,
    padding: 16,
  },
  addressHeader: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  addressItemContainer: {
    marginBottom: 16,
  },
  addressItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 8,
    backgroundColor: '#f8f8f8',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  circle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    marginRight: 10,  // Adjust space between circle and logo
  },
  circleUnselected: {
    borderColor: '#dcdcdc',
  },
  circleSelected: {
    borderColor: '#007bff',
    backgroundColor: '#007bff',
  },
  addressText: {
    flex: 1,
    fontSize: 16,
  },
  iconTextContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  codLogoContainer: {
    width: 40,  // Adjust to fit your design
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,  // Space between logo and text
  },
  codLogo: {
    width: '100%',
    height: '100%',
  },
  gcashLogoContainer: {
    width: 40,   // Box width (adjust as needed)
    height: 40,  // Box height (adjust as needed)
    justifyContent: 'center',  // Center the logo within the box
    alignItems: 'center',      // Center the logo within the box
    borderRadius: 5,           // Optional: Rounded corners for the box
    backgroundColor: '#f0f0f0', // Optional: Background color of the box
  },
  gcashLogo: {
    width: '100%',  // Ensure the logo fills the container while keeping aspect ratio
    height: '100%',
  },
  deliverButton: {
    padding: 10,
    backgroundColor: '#007bff',
    borderRadius: 5,
    marginTop: 10,
    alignItems: 'center',
  },
  deliverButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  addAddressButton: {
    padding: 10,
    backgroundColor: '#007bff',
    borderRadius: 5,
    alignItems: 'center',
    marginVertical: 20,
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  addAddressForm: {
    marginTop: 20,
  },
  addressInput: {
    borderBottomWidth: 1,
    borderBottomColor: '#ccc',
    marginBottom: 10,
    padding: 10,
  },
  cancelButton: {
    marginTop: 10,
    alignItems: 'center',
  },
  deliveryHeader: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  deliveryOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    backgroundColor: '#f8f8f8',
    borderRadius: 5,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  deliveryOptionText: {
    fontSize: 16,
    marginLeft: 10,
  },
  nextButton: {
    padding: 10,
    backgroundColor: '#007bff',
    borderRadius: 5,
    alignItems: 'center',
    marginTop: 20,
  },
  paymentHeader: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  reviewText: {
    fontSize: 16,
    marginBottom: 10,
  },
  placeOrderButton: {
    padding: 10,
    backgroundColor: '#007bff',
    borderRadius: 5,
    alignItems: 'center',
    marginTop: 20,
  },
  productItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  editButton: {
    backgroundColor: '#007bff',
    padding: 8,
    borderRadius: 5,
    marginRight: 10,
  },
  editButton: {
    position: 'absolute',
    right: 40,
  },
  removeButton: {
    position: 'absolute',
    right: 10,
  },
  removeButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  addressActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  productImage: {
    width: 50,
    height: 50,
    marginRight: 10,
    borderRadius: 5,
  },
  productDetailsContainer: {
    flex: 1,
  },
  productName: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  productDetails: {
    fontSize: 14,
    color: '#555',
  },
  selectedAddress: {
    backgroundColor: '#e0ffe0',
  },
});

export default OrderScreen;
