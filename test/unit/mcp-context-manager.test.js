const MCPContextManager = require('@/protocols/mcp-context-manager');

describe('MCPContextManager', () => {
  let contextManager;

  beforeEach(() => {
    contextManager = new MCPContextManager();
  });

  test('should register and retrieve templates', () => {
    const templateId = 'testTemplate';
    const template = 'Hello {{name}}, welcome to {{service}}!';
    
    contextManager.registerTemplate(templateId, template);
    
    expect(contextManager.templateCache.has(templateId)).toBe(true);
    expect(contextManager.templateCache.get(templateId)).toBe(template);
  });

  test('should store and retrieve user context', () => {
    const userId = 'user123';
    const contextData = {
      name: 'John',
      preferences: { color: 'blue' }
    };
    
    contextManager.storeContext(userId, contextData);
    
    const storedContext = contextManager.contextStore.get(userId);
    expect(storedContext).toMatchObject(contextData);
    expect(storedContext.updatedAt).toBeDefined();
  });

  test('should generate prompts with context data', () => {
    const userId = 'user123';
    const templateId = 'testTemplate';
    const template = 'Hello {{name}}, welcome to {{service}}!';
    
    // Register template
    contextManager.registerTemplate(templateId, template);
    
    // Store user context
    contextManager.storeContext(userId, {
      name: 'John'
    });
    
    // Additional data for the prompt
    const additionalData = {
      service: 'LG Shopping'
    };
    
    const prompt = contextManager.generatePrompt(userId, templateId, additionalData);
    
    expect(prompt).toBe('Hello John, welcome to LG Shopping!');
  });

  test('should update specific context fields', () => {
    const userId = 'user123';
    
    // Initial context
    contextManager.storeContext(userId, {
      name: 'John',
      preferences: { color: 'blue' }
    });
    
    // Update one field
    contextManager.updateContext(userId, 'preferences', { color: 'red' });
    
    const updatedContext = contextManager.contextStore.get(userId);
    expect(updatedContext.name).toBe('John');
    expect(updatedContext.preferences).toEqual({ color: 'red' });
  });

  test('should handle missing templates', () => {
    const userId = 'user123';
    const nonExistentTemplate = 'missingTemplate';
    
    contextManager.storeContext(userId, { name: 'John' });
    
    expect(() => {
      contextManager.generatePrompt(userId, nonExistentTemplate);
    }).toThrow(`Template ${nonExistentTemplate} not found`);
  });

  test('should handle missing user context', () => {
    const unknownUserId = 'unknown';
    const templateId = 'testTemplate';
    const template = 'Hello {{name}}, welcome!';
    
    contextManager.registerTemplate(templateId, template);
    
    const prompt = contextManager.generatePrompt(unknownUserId, templateId);
    
    // Should keep the placeholder as is
    expect(prompt).toBe('Hello {{name}}, welcome!');
  });

  test('should leave unmatched placeholders unchanged', () => {
    const userId = 'user123';
    const templateId = 'testTemplate';
    const template = 'Hello {{name}}, your ID is {{userId}}!';
    
    contextManager.registerTemplate(templateId, template);
    contextManager.storeContext(userId, { name: 'John' });
    
    const prompt = contextManager.generatePrompt(userId, templateId);
    
    // Only name should be replaced, userId remains a placeholder
    expect(prompt).toBe('Hello John, your ID is {{userId}}!');
  });
});
