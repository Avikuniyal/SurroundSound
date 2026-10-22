import sys
import tensorflow as tf
import tensorflow_hub as hub
from test_classifier import load_wav_16k_mono, build_classifier_head, ReduceMeanLayer, YAMNET_HANDLE

def build_end_to_end_pipeline(classifier_model):
    """
    Combines WAV preprocessing, frozen YAMNet feature extraction, 
    and the trained custom classifier head into a single model.
    """
    input_segment = tf.keras.layers.Input(shape=(), dtype=tf.string, name='audio_file')
    
    # 1. Preprocess WAV file
    wav_data = load_wav_16k_mono(input_segment)
    
    # 2. Extract YAMNet Embeddings
    embedding_layer = hub.KerasLayer(YAMNET_HANDLE, trainable=False, name='yamnet')
    scores, embeddings, spectrogram = embedding_layer(wav_data)
    
    # 3. Average frame-level embeddings across the audio length
    avg_embedding = ReduceMeanLayer(axis=0, name='averaging')(embeddings)
    
    # 4. Pass through custom classifier head
    output = classifier_model(avg_embedding)
    
    end_to_end_model = tf.keras.Model(inputs=input_segment, outputs=output)
    end_to_end_model.compile(
        loss=tf.keras.losses.BinaryCrossentropy(),
        optimizer="adam",
        metrics=['accuracy']
    )
    return end_to_end_model

def run_test_inference(audio_path, model):
    """Executes prediction on a target WAV file path."""
    tensor_input = tf.constant(audio_path)
    prediction = model(tensor_input)
    print(f"File: {audio_path} | Engine Probability: {prediction.numpy()[0]:.4f}")

if __name__ == "__main__":
    # Initialize classifier head
    classifier_head = build_classifier_head()
    
    # Assemble full end-to-end model
    pipeline = build_end_to_end_pipeline(classifier_head)
    
    # Test on target WAV file passed via command line or default test file
    test_file = sys.argv[1] if len(sys.argv) > 1 else "test_data/miaow_16k.wav"
    
    print(f"Running inference on: {test_file}")
    run_test_inference(test_file, pipeline)