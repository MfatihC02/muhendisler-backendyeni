import { Schema } from 'mongoose';

const specifications = {
    // Tohum özellikleri şeması
    seed: {
        type: new Schema({
            germinationRate: {
                type: Number,
                required: true,
                min: 0,
                max: 100
            },
            growthPeriod: {
                type: String,
                required: true
            },
            harvestTime: String,
            plantingDepth: String,
            sowingDistance: String,
            yield: String,
            season: {
                type: String,
                enum: ['ilkbahar', 'yaz', 'sonbahar', 'kış', 'tümYıl']
            },
            origin: String,
            packaging: {
                weight: {
                    type: Number,
                    required: true
                },
                unit: {
                    type: String,
                    enum: ['gr', 'kg', 'adet'],
                    required: true
                }
            }
        }, { _id: false })
    },

    // Fide özellikleri şeması (güncellenmiş hali)
    seedling: {
        type: new Schema({
            planting: {
                soil: String,
                season: String,
                spacing: String
            },
            variety: {
                type: String,
                required: true,
                enum: ['hibrit', 'standart']
            },
            packaging: {
                type: {
                    type: String,
                    required: true,
                    enum: ['200lu_viyol', '350li_viyol', '400lu_viyol', 'diger']
                },
                description: String
            }
        }, { _id: false })
    },

    // Gübre özellikleri şeması (güncellenmiş hali)
    fertilizer: {
        type: new Schema({
            nutrientContent: {
                type: Map,
                of: {
                    value: Number,
                    unit: {
                        type: String,
                        default: '%'
                    }
                }
            },
            applicationMethod: {
                type: String,
                required: true
            },
            composition: String,
            packaging: {
                weight: Number,
                unit: {
                    type: String,
                    enum: ['gr', 'kg', 'lt', 'adet']
                }
            },
            usage: {
                dosage: String,
                frequency: String,
                warnings: [String]
            }
        }, { _id: false })
    },

    // Zirai alet özellikleri şeması
    agriculturalTool: {
        type: new Schema({
            toolType: {
                type: String,
                required: true,
                enum: ['manual', 'motorized', 'electronic', 'mechanical']
            },
            general: {
                brand: {
                    type: String,
                    required: true
                },
                model: String,
                manufacturingYear: Number,
                warranty: {
                    duration: Number,
                    type: String
                },
                origin: String,
                weight: {
                    value: Number,
                    unit: {
                        type: String,
                        enum: ['kg', 'gr', 'adet']
                    }
                },
                dimensions: {
                    length: Number,
                    width: Number,
                    height: Number,
                    unit: {
                        type: String,
                        enum: ['cm', 'm']
                    }
                }
            },
            technical: {
                engine: {
                    type: {
                        type: String,
                        enum: ['electric', 'gasoline', 'diesel', null]
                    },
                    power: {
                        value: Number,
                        unit: String
                    },
                    fuelType: String,
                    fuelCapacity: Number
                },
                sprayer: {
                    tankCapacity: {
                        value: Number,
                        unit: String
                    },
                    sprayDistance: {
                        value: Number,
                        unit: String
                    },
                    pressureRange: {
                        min: Number,
                        max: Number,
                        unit: String
                    },
                    nozzleTypes: [String]
                },
                hoeMachine: {
                    workingWidth: {
                        value: Number,
                        unit: String
                    },
                    workingDepth: {
                        value: Number,
                        unit: String
                    },
                    bladeCount: Number,
                    gearSystem: String
                }
            },
            maintenance: {
                spareParts: [{
                    name: String,
                    code: String,
                    availability: Boolean
                }],
                serviceInfo: {
                    available: Boolean,
                    coverage: [String],
                    instructions: String
                }
            },
            usage: {
                applications: [String],
                safety: [String],
                instructions: String
            }
        }, { _id: false })
    }
};

export default specifications;
