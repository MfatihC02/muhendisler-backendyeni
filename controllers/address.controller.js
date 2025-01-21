import { Address, VALID_CITIES, VALID_STATE_CODES } from '../models/address.model.js';
import mongoose from 'mongoose';

// Yardımcı fonksiyonlar
const formatPhoneNumber = (phone) => {
    // Sadece rakamları al
    const numbers = phone.replace(/\D/g, '');
    // Başında 0 varsa kaldır
    return numbers.startsWith('0') ? numbers.slice(1) : numbers;
};

const getStateCodeForCity = (city) => {
    const stateCodes = {
        'Konya': 'TR-42',
        'Ankara': 'TR-06'
    };
    return stateCodes[city] || null;
};

const addressController = {
    // Tüm adresleri getir
    getAllAddresses: async (req, res) => {
        try {
            const addresses = await Address.find({ user: req.user._id })
                .sort({ isDefault: -1, createdAt: -1 });

            res.status(200).json({
                success: true,
                addresses
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: 'Adresler getirilirken bir hata oluştu'
            });
        }
    },

    // Tek bir adresi getir
    getAddress: async (req, res) => {
        try {
            const address = await Address.findOne({
                _id: req.params.id,
                user: req.user._id
            });

            if (!address) {
                return res.status(404).json({
                    success: false,
                    error: 'Adres bulunamadı'
                });
            }

            res.status(200).json({
                success: true,
                address
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: 'Adres getirilirken bir hata oluştu'
            });
        }
    },

    // Yeni adres oluştur
    createAddress: async (req, res) => {
        try {
            const {
                title,
                fullName,
                phone,
                city,
                district,
                neighborhood,
                fullAddress,
                zipCode,
                isDefault = false,
                type = 'both'
            } = req.body;

            // Telefon numarasını formatla
            const formattedPhone = formatPhoneNumber(phone);

            // StateCode'u belirle
            const stateCode = getStateCodeForCity(city);

            // Yeni adres oluştur
            const address = new Address({
                user: req.user._id,
                title,
                fullName,
                phone: formattedPhone,
                city,
                stateCode,  
                district,
                neighborhood,
                fullAddress,
                zipCode,
                countryCode: 'TR',
                isDefault,
                type
            });

            // Eğer varsayılan adres ise, diğer varsayılan adresleri güncelle
            if (isDefault) {
                await Address.updateMany(
                    { user: req.user._id, isDefault: true },
                    { isDefault: false }
                );
            }

            await address.save();

            res.status(201).json({
                success: true,
                message: 'Adres başarıyla oluşturuldu',
                address
            });
        } catch (error) {
            console.error('Adres oluşturma hatası:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Adres oluşturulurken bir hata oluştu'
            });
        }
    },

    // Adres güncelle
    updateAddress: async (req, res) => {
        try {
            const addressId = req.params.id;
            const updates = req.body;

            // Adresin varlığını kontrol et
            const existingAddress = await Address.findOne({
                _id: addressId,
                user: req.user._id
            });

            if (!existingAddress) {
                return res.status(404).json({
                    success: false,
                    error: 'Adres bulunamadı'
                });
            }

            // Telefon numarasını formatla
            if (updates.phone) {
                updates.phone = formatPhoneNumber(updates.phone);
            }

            // Varsayılan adres güncelleme işlemi
            if (updates.isDefault === true) {
                await Address.updateMany(
                    { 
                        user: req.user._id, 
                        _id: { $ne: addressId },
                        isDefault: true 
                    },
                    { isDefault: false }
                );
            }

            // Adresi güncelle
            const updatedAddress = await Address.findByIdAndUpdate(
                addressId,
                updates,
                { new: true, runValidators: true }
            );

            res.status(200).json({
                success: true,
                message: 'Adres başarıyla güncellendi',
                address: updatedAddress
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: 'Adres güncellenirken bir hata oluştu'
            });
        }
    },

    // Adres sil
    deleteAddress: async (req, res) => {
        try {
            const address = await Address.findOneAndDelete({
                _id: req.params.id,
                user: req.user._id
            });

            if (!address) {
                return res.status(404).json({
                    success: false,
                    error: 'Adres bulunamadı'
                });
            }

            res.status(200).json({
                success: true,
                message: 'Adres başarıyla silindi'
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: 'Adres silinirken bir hata oluştu'
            });
        }
    },

    // Varsayılan adresi getir
    getDefaultAddress: async (req, res) => {
        try {
            const address = await Address.findOne({
                user: req.user._id,
                isDefault: true
            });

            if (!address) {
                return res.status(404).json({
                    success: false,
                    error: 'Varsayılan adres bulunamadı'
                });
            }

            res.status(200).json({
                success: true,
                address
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: 'Varsayılan adres getirilirken bir hata oluştu'
            });
        }
    },

    // Şehir listesini getir
    getCities: async (req, res) => {
        try {
            res.status(200).json({
                success: true,
                cities: VALID_CITIES
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: 'Şehir listesi getirilirken bir hata oluştu'
            });
        }
    },

    // İlçe listesini getir
    getDistricts: async (req, res) => {
        try {
            const { city } = req.params;
            
            if (!VALID_CITIES.includes(city)) {
                return res.status(400).json({
                    success: false,
                    error: 'Geçersiz şehir'
                });
            }

            const districts = {
                'Konya': ['Selçuklu', 'Meram', 'Karatay'],
                'Ankara': ['Çankaya', 'Keçiören', 'Yenimahalle']
            };

            res.status(200).json({
                success: true,
                districts: districts[city] || []
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: 'İlçe listesi getirilirken bir hata oluştu'
            });
        }
    },

    // Admin fonksiyonları
    getAllUsersAddresses: async (req, res) => {
        try {
            const addresses = await Address.find()
                .populate('user', 'email name')
                .sort({ createdAt: -1 });

            res.status(200).json({
                success: true,
                addresses
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Adresler getirilirken bir hata oluştu',
                error: error.message
            });
        }
    },

    getUserAddresses: async (req, res) => {
        try {
            const { userId } = req.params;
            const addresses = await Address.find({ user: userId })
                .sort({ isDefault: -1, createdAt: -1 });

            res.status(200).json({
                success: true,
                addresses
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Kullanıcı adresleri getirilirken bir hata oluştu',
                error: error.message
            });
        }
    },

    adminUpdateAddress: async (req, res) => {
        try {
            const { id } = req.params;
            const updatedAddress = await Address.findByIdAndUpdate(
                id,
                { ...req.body },
                { new: true, runValidators: true }
            );

            if (!updatedAddress) {
                return res.status(404).json({
                    success: false,
                    message: 'Adres bulunamadı'
                });
            }

            res.status(200).json({
                success: true,
                address: updatedAddress
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Adres güncellenirken bir hata oluştu',
                error: error.message
            });
        }
    },

    adminDeleteAddress: async (req, res) => {
        try {
            const { id } = req.params;
            const deletedAddress = await Address.findByIdAndDelete(id);

            if (!deletedAddress) {
                return res.status(404).json({
                    success: false,
                    message: 'Adres bulunamadı'
                });
            }

            res.status(200).json({
                success: true,
                message: 'Adres başarıyla silindi'
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Adres silinirken bir hata oluştu',
                error: error.message
            });
        }
    }
};

export { addressController };
