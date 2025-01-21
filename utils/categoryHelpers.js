import slugify from 'slugify';
import { Category } from '../models/category.model.js';

export const categoryHelpers = {
    // SEO dostu URL oluşturma
    generateSlug: async (name, existingId = null) => {
        let slug = slugify(name, {
            lower: true,
            strict: true,
            locale: 'tr'
        });

        let counter = 0;
        let newSlug = slug;

        // Slug benzersizlik kontrolü
        while (true) {
            const query = { slug: newSlug };
            if (existingId) {
                query._id = { $ne: existingId };
            }

            const exists = await Category.exists(query);
            if (!exists) break;

            counter++;
            newSlug = `${slug}-${counter}`;
        }

        return newSlug;
    },

    // Kategori ağacı oluşturma
    buildCategoryTree: (categories, parentId = null) => {
        const tree = [];
        
        categories.forEach(category => {
            if (category.parent?.toString() === parentId?.toString()) {
                const children = categoryHelpers.buildCategoryTree(categories, category._id);
                if (children.length > 0) {
                    category._doc.children = children;
                }
                tree.push(category);
            }
        });

        return tree;
    },

    // Tüm alt kategorileri bulma
    getAllChildCategories: async (categoryId) => {
        const children = await Category.find({
            'ancestors._id': categoryId
        });
        return children.map(child => child._id);
    },

    // Kategori derinliğini hesaplama
    calculateCategoryDepth: async (categoryId) => {
        const category = await Category.findById(categoryId);
        return category ? category.ancestors.length : 0;
    },

    // Alt kategorilerin seviyelerini güncelleme
    updateChildrenLevels: async (categoryId, newLevel) => {
        const children = await Category.find({
            'ancestors._id': categoryId
        });

        for (const child of children) {
            const levelDiff = newLevel - child.ancestors.find(a => a._id.toString() === categoryId.toString()).level;
            child.level += levelDiff;
            await child.save();
        }
    }
};