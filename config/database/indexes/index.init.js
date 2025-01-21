import { IndexManager } from './index.manager.js';

export async function initializeIndexes() {
  try {
    // Index oluşturma
    await IndexManager.createIndexes();
    console.log('Database indexes created successfully');

    // Index durumu kontrolü
    const indexStatus = await IndexManager.validateIndexes();
    console.log('Current index status:', indexStatus);

    return true;
  } catch (error) {
    console.error('Index initialization failed:', error);
    throw error;
  }
}

// Development ortamında index durumunu kontrol etmek için yardımcı fonksiyon
export async function checkIndexStatus() {
  try {
    const status = await IndexManager.validateIndexes();
    console.log('Index Status Check:', status);
    return status;
  } catch (error) {
    console.error('Index status check failed:', error);
    throw error;
  }
}

// Gerektiğinde indexleri yeniden oluşturmak için yardımcı fonksiyon
export async function rebuildIndexes(modelName) {
  try {
    // Önce indexleri sil
    await IndexManager.dropIndexes(modelName);
    console.log(`Dropped indexes for ${modelName}`);

    // Sonra yeniden oluştur
    await IndexManager.createIndexes();
    console.log(`Rebuilt indexes for ${modelName}`);

    return true;
  } catch (error) {
    console.error('Index rebuild failed:', error);
    throw error;
  }
}
