import mongoose from 'mongoose';
import { DatabaseIndexes } from './index.config.js';

export class IndexManager {
  static async createIndexes() {
    console.log('Creating database indexes...');
    
    for (const [modelName, indexes] of Object.entries(DatabaseIndexes)) {
      try {
        const Model = mongoose.model(modelName);
        
        // Unique indexler
        if (indexes.unique) {
          for (const index of indexes.unique) {
            await Model.collection.createIndex(
              index.fields,
              { ...index.options, background: true }
            );
            console.log(`Created unique index for ${modelName}:`, index.fields);
          }
        }

        // Performance indexler
        if (indexes.performance) {
          for (const index of indexes.performance) {
            await Model.collection.createIndex(
              index.fields,
              index.options
            );
            console.log(`Created performance index for ${modelName}:`, index.fields);
          }
        }
      } catch (error) {
        console.error(`Error creating index for ${modelName}:`, error);
      }
    }
  }

  static async validateIndexes() {
    console.log('Validating database indexes...');
    const status = {};
    
    for (const [modelName] of Object.entries(DatabaseIndexes)) {
      try {
        const Model = mongoose.model(modelName);
        const indexes = await Model.collection.indexes();
        status[modelName] = {
          total: indexes.length,
          indexes: indexes.map(idx => ({
            name: idx.name,
            fields: idx.key
          }))
        };
      } catch (error) {
        status[modelName] = { error: error.message };
      }
    }
    
    return status;
  }

  static async dropIndexes(modelName) {
    if (!modelName) {
      throw new Error('Model name is required');
    }

    try {
      const Model = mongoose.model(modelName);
      await Model.collection.dropIndexes();
      console.log(`Dropped all indexes for ${modelName}`);
    } catch (error) {
      console.error(`Error dropping indexes for ${modelName}:`, error);
      throw error;
    }
  }
}
